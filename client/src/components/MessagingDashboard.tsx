import { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount, useWriteContract, useWatchContractEvent, usePublicClient } from 'wagmi';
import { MessageMetadataABI } from '../contracts/MessageMetadata';
import { keccak256, toUtf8Bytes } from 'ethers';
import './MessagingDashboard.css';

interface Message {
    hash: string;
    senderDID: string;
    receiverDID: string;
    timestamp: number;
    content?: string;
    ipfsCid?: string;
    acknowledged: boolean;
    isSent: boolean;
}

const MessagingDashboard = () => {
    const { address } = useAccount();
    const [messages, setMessages] = useState<Message[]>([]);
    const [activeTab, setActiveTab] = useState<'compose' | 'inbox' | 'sent'>('compose');
    const [recipientDID, setRecipientDID] = useState('');
    const [messageContent, setMessageContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const hasFetchedHistory = useRef(false);

    const { writeContract } = useWriteContract();
    const publicClient = usePublicClient();

    const myDID = address ? `did:eth:${address.toLowerCase()}` : '';

    const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY || '';
    const PINATA_SECRET_KEY = import.meta.env.VITE_PINATA_SECRET_KEY || '';

    // Load locally saved messages on mount
    useEffect(() => {
        if (!myDID) return;
        const saved = localStorage.getItem(`sent_messages_${myDID}`);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setMessages(prev => {
                    const existingHashes = new Set(prev.map(m => m.hash));
                    const newMessages = parsed.filter((m: Message) => !existingHashes.has(m.hash));
                    return [...prev, ...newMessages];
                });
            } catch (e) {
                console.error("Failed to load saved messages", e);
            }
        }
    }, [myDID]);

    useEffect(() => {
        if (!publicClient || !myDID || hasFetchedHistory.current) return;

        const fetchHistory = async () => {
            try {
                hasFetchedHistory.current = true;
                const currentBlock = await publicClient.getBlockNumber();
                const totalBlocksToFetch = 100n;
                const chunkSize = 10n;

                const startBlock = currentBlock - totalBlocksToFetch > 0n ? currentBlock - totalBlocksToFetch : 0n;

                const sentLogs = [];
                const ackLogs = [];

                for (let i = startBlock; i < currentBlock; i += chunkSize) {
                    const to = (i + chunkSize - 1n) < currentBlock ? (i + chunkSize - 1n) : currentBlock;
                    try {
                        const chunkSent = await publicClient.getContractEvents({
                            address: import.meta.env.VITE_MESSAGE_METADATA_ADDRESS as `0x${string}`,
                            abi: MessageMetadataABI,
                            eventName: 'MessageSent',
                            fromBlock: i,
                            toBlock: to
                        });
                        sentLogs.push(...chunkSent);

                        const chunkAck = await publicClient.getContractEvents({
                            address: import.meta.env.VITE_MESSAGE_METADATA_ADDRESS as `0x${string}`,
                            abi: MessageMetadataABI,
                            eventName: 'MessageAcknowledged',
                            fromBlock: i,
                            toBlock: to
                        });
                        ackLogs.push(...chunkAck);
                    } catch (err) {
                        console.warn(`Failed to fetch logs for chunk ${i}-${to}`, err);
                    }
                }

                const acknowledgedHashes = new Set(
                    ackLogs.map(log => ((log as any).args).messageHash)
                );

                const historicalMessages: Message[] = [];

                for (const log of sentLogs) {
                    const args = (log as any).args;
                    const { messageHash, senderDID, receiverDID, timestamp, ipfsCid } = args;

                    const isIncoming = receiverDID.toLowerCase() === myDID.toLowerCase();
                    const isOutgoing = senderDID.toLowerCase() === myDID.toLowerCase();

                    let content: string | undefined;

                    // If it's a local CID, try to get content immediately
                    if (ipfsCid?.startsWith('local-')) {
                        const encrypted = localStorage.getItem(`ipfs_${ipfsCid}`);
                        if (encrypted) {
                            try {
                                content = atob(encrypted);
                            } catch (e) {
                                console.error('Failed to decrypt message', e);
                            }
                        }
                    }

                    if (isIncoming) {
                        historicalMessages.push({
                            hash: messageHash,
                            senderDID,
                            receiverDID,
                            timestamp: Number(timestamp),
                            acknowledged: acknowledgedHashes.has(messageHash),
                            isSent: false,
                            ipfsCid,
                            content
                        });
                    }

                    if (isOutgoing) {
                        historicalMessages.push({
                            hash: messageHash,
                            senderDID,
                            receiverDID,
                            timestamp: Number(timestamp),
                            acknowledged: acknowledgedHashes.has(messageHash),
                            isSent: true,
                            ipfsCid,
                            content
                        });
                    }
                }

                setMessages(prev => {
                    const existingKeys = new Set(prev.map(m => `${m.hash}-${m.isSent}`));
                    const newMessages = historicalMessages.filter(m => !existingKeys.has(`${m.hash}-${m.isSent}`));
                    return [...prev, ...newMessages];
                });

            } catch (error) {
                console.error("Failed to fetch message history:", error);
            }
        };

        fetchHistory();
    }, [publicClient, myDID]);

    const handleMessageSent = useCallback((logs: any[]) => {
        logs.forEach(async (log) => {
            const args = (log as any).args;
            const { messageHash, senderDID, receiverDID, timestamp } = args;

            if (receiverDID.toLowerCase() === myDID.toLowerCase()) {
                const ipfsCid = args.ipfsCid;
                let content: string | undefined;

                if (ipfsCid?.startsWith('local-')) {
                    const encrypted = localStorage.getItem(`ipfs_${ipfsCid}`);
                    if (encrypted) {
                        content = atob(encrypted);
                    }
                }

                const newMessage: Message = {
                    hash: messageHash,
                    senderDID,
                    receiverDID,
                    timestamp: Number(timestamp),
                    acknowledged: false,
                    isSent: false,
                    ipfsCid,
                    content
                };

                setMessages(prev => {
                    if (prev.some(m => m.hash === messageHash && m.isSent === false)) return prev;
                    return [...prev, newMessage];
                });
            }

            if (senderDID.toLowerCase() === myDID.toLowerCase()) {
                const sentMessage: Message = {
                    hash: messageHash,
                    senderDID,
                    receiverDID,
                    timestamp: Number(timestamp),
                    acknowledged: false,
                    isSent: true,
                };

                setMessages(prev => {
                    if (prev.some(m => m.hash === messageHash && m.isSent === true)) return prev;
                    const updated = [...prev, sentMessage];
                    localStorage.setItem(`sent_messages_${myDID}`, JSON.stringify(updated.filter(m => m.isSent)));
                    return updated;
                });
            }
        });
    }, [myDID]);

    const handleMessageAcknowledged = useCallback((logs: any[]) => {
        logs.forEach((log) => {
            const args = (log as any).args;
            const { messageHash } = args;

            setMessages(prev =>
                prev.map(msg =>
                    msg.hash === messageHash ? { ...msg, acknowledged: true } : msg
                )
            );
        });
    }, []);

    useWatchContractEvent({
        address: import.meta.env.VITE_MESSAGE_METADATA_ADDRESS as `0x${string}`,
        abi: MessageMetadataABI,
        eventName: 'MessageSent',
        onLogs: handleMessageSent,
        enabled: !!myDID,
    });

    useWatchContractEvent({
        address: import.meta.env.VITE_MESSAGE_METADATA_ADDRESS as `0x${string}`,
        abi: MessageMetadataABI,
        eventName: 'MessageAcknowledged',
        onLogs: handleMessageAcknowledged,
        enabled: !!myDID,
    });

    const encryptMessage = (content: string): string => {
        return btoa(content);
    };

    const decryptMessage = (encrypted: string): string => {
        try {
            return atob(encrypted);
        } catch {
            return '[Unable to decrypt message]';
        }
    };

    const uploadToIPFS = async (content: string): Promise<string> => {
        try {
            const encrypted = encryptMessage(content);

            if (PINATA_API_KEY && PINATA_SECRET_KEY) {
                const formData = new FormData();
                const blob = new Blob([encrypted], { type: 'text/plain' });
                formData.append('file', blob);

                const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
                    method: 'POST',
                    headers: {
                        'pinata_api_key': PINATA_API_KEY,
                        'pinata_secret_api_key': PINATA_SECRET_KEY,
                    },
                    body: formData,
                });

                const data = await response.json();
                return data.IpfsHash;
            } else {
                const cid = 'local-' + Date.now() + '-' + Math.random().toString(36).substring(7);
                localStorage.setItem(`ipfs_${cid}`, encrypted);
                console.warn('Using localStorage fallback. Configure Pinata for production!');
                return cid;
            }
        } catch (error) {
            console.error('IPFS upload error:', error);
            throw new Error('Failed to upload to IPFS');
        }
    };

    const fetchFromIPFS = async (cid: string): Promise<string> => {
        try {
            if (cid.startsWith('local-')) {
                const encrypted = localStorage.getItem(`ipfs_${cid}`);
                if (!encrypted) throw new Error('Content not found');
                return decryptMessage(encrypted);
            }

            const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
            if (!response.ok) throw new Error('Failed to fetch from IPFS');

            const encrypted = await response.text();
            return decryptMessage(encrypted);
        } catch (error) {
            console.error('IPFS fetch error:', error);
            return '[Content unavailable]';
        }
    };

    const sendMessage = async () => {
        if (!recipientDID || !messageContent) {
            setStatusMessage('Please enter both recipient and message');
            return;
        }

        if (!recipientDID.startsWith('did:eth:')) {
            setStatusMessage('Invalid DID format. Must start with "did:eth:"');
            return;
        }

        setIsLoading(true);
        setStatusMessage('Uploading to IPFS...');

        try {
            const ipfsCid = await uploadToIPFS(messageContent);
            setStatusMessage('Creating message commitment...');

            const messageHash = keccak256(toUtf8Bytes(ipfsCid + messageContent));

            const cidMapping = localStorage.getItem('ipfs_cid_mapping');
            const mapping = cidMapping ? JSON.parse(cidMapping) : {};
            mapping[messageHash] = ipfsCid;
            localStorage.setItem('ipfs_cid_mapping', JSON.stringify(mapping));

            try {
                await fetch('http://localhost:3001/store-cid', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messageHash, ipfsCid })
                });
                console.log('CID stored on server for cross-user access');
            } catch (err) {
                console.warn('Failed to store CID on server:', err);
            }

            writeContract({
                address: import.meta.env.VITE_MESSAGE_METADATA_ADDRESS as `0x${string}`,
                abi: MessageMetadataABI,
                functionName: 'sendMessageCommitment',
                args: [messageHash, recipientDID],
            }, {
                onSuccess: () => {
                    setStatusMessage('✓ Message sent successfully!');
                    setMessageContent('');
                    setRecipientDID('');

                    const newMessage: Message = {
                        hash: messageHash,
                        senderDID: myDID,
                        receiverDID: recipientDID,
                        timestamp: Date.now() / 1000,
                        content: messageContent,
                        ipfsCid,
                        acknowledged: false,
                        isSent: true,
                    };
                    setMessages(prev => {
                        const updated = [...prev, newMessage];
                        localStorage.setItem(`sent_messages_${myDID}`, JSON.stringify(updated.filter(m => m.isSent)));
                        return updated;
                    });

                    setTimeout(() => setStatusMessage(''), 3000);
                },
                onError: (error) => {
                    setStatusMessage(`Error: ${error.message}`);
                },
            });
        } catch (error: any) {
            setStatusMessage(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const acknowledgeMessage = async (messageHash: string) => {
        writeContract({
            address: import.meta.env.VITE_MESSAGE_METADATA_ADDRESS as `0x${string}`,
            abi: MessageMetadataABI,
            functionName: 'acknowledgeMessage',
            args: [messageHash],
        }, {
            onSuccess: () => {
                setMessages(prev => {
                    const updated = prev.map(msg =>
                        msg.hash === messageHash ? { ...msg, acknowledged: true } : msg
                    );
                    localStorage.setItem(`sent_messages_${myDID}`, JSON.stringify(updated.filter(m => m.isSent)));
                    return updated;
                });
                setStatusMessage('✓ Message acknowledged!');
                setTimeout(() => setStatusMessage(''), 3000);
            },
            onError: (error) => {
                setStatusMessage(`Error: ${error.message}`);
            },
        });
    };

    const loadMessageContent = async (message: Message) => {

        if (message.content) return;
        if (!message.ipfsCid) {
            const keys = Object.keys(localStorage);
            for (const key of keys) {
                if (key.startsWith('ipfs_')) {
                    const content = localStorage.getItem(key);
                    if (content) {
                    }
                }
            }

            alert("For historical messages fetched from chain, the IPFS CID is not available in the current contract version. You can only read messages received while you are online.");
            return;
        }

        const content = await fetchFromIPFS(message.ipfsCid);
        setMessages(prev =>
            prev.map(msg =>
                msg.hash === message.hash ? { ...msg, content } : msg
            )
        );
    };

    const inboxMessages = messages.filter(m => !m.isSent);
    const sentMessages = messages.filter(m => m.isSent);

    return (
        <div className="messaging-dashboard">
            <header className="dashboard-header">
                <h1>Secure Messaging</h1>
                <div className="user-info">
                    <span className="did-badge">Your DID: {myDID}</span>
                </div>
            </header>

            <nav className="dashboard-nav">
                <button
                    className={activeTab === 'compose' ? 'active' : ''}
                    onClick={() => setActiveTab('compose')}
                >
                    Compose
                </button>
                <button
                    className={activeTab === 'inbox' ? 'active' : ''}
                    onClick={() => setActiveTab('inbox')}
                >
                    Inbox ({inboxMessages.length})
                </button>
                <button
                    className={activeTab === 'sent' ? 'active' : ''}
                    onClick={() => setActiveTab('sent')}
                >
                    Sent ({sentMessages.length})
                </button>
            </nav>

            {statusMessage && (
                <div className={`status-message ${statusMessage.includes('✓') ? 'success' : statusMessage.includes('Error') ? 'error' : ''}`}>
                    {statusMessage}
                </div>
            )}

            <main className="dashboard-content">
                {activeTab === 'compose' && (
                    <div className="compose-section">
                        <h2>Send New Message</h2>
                        <div className="form-group">
                            <label htmlFor="recipient">Recipient DID</label>
                            <input
                                id="recipient"
                                type="text"
                                placeholder="did:eth:0x..."
                                value={recipientDID}
                                onChange={(e) => setRecipientDID(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="message">Message</label>
                            <textarea
                                id="message"
                                placeholder="Type your message here..."
                                value={messageContent}
                                onChange={(e) => setMessageContent(e.target.value)}
                                disabled={isLoading}
                                rows={8}
                            />
                        </div>
                        <button
                            className="send-button"
                            onClick={sendMessage}
                            disabled={isLoading || !recipientDID || !messageContent}
                        >
                            {isLoading ? 'Sending...' : 'Send Message'}
                        </button>
                    </div>
                )}

                {activeTab === 'inbox' && (
                    <div className="messages-section">
                        <h2>Received Messages</h2>
                        {inboxMessages.length === 0 ? (
                            <div className="empty-state">
                                <p>No messages yet</p>
                            </div>
                        ) : (
                            <div className="messages-list">
                                {inboxMessages.map((message) => (
                                    <div key={message.hash} className="message-card">
                                        <div className="message-header">
                                            <span className="message-from">From: {message.senderDID}</span>
                                            <span className="message-time">
                                                {new Date(message.timestamp * 1000).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="message-body">
                                            {message.content ? (
                                                <p>{message.content}</p>
                                            ) : (
                                                <button
                                                    className="load-button"
                                                    onClick={() => loadMessageContent(message)}
                                                >
                                                    {message.ipfsCid ? 'Load Message' : 'CID Missing (Historical)'}
                                                </button>
                                            )}
                                        </div>
                                        <div className="message-footer">
                                            {message.acknowledged ? (
                                                <span className="acknowledged">✓ Acknowledged</span>
                                            ) : (
                                                <button
                                                    className="ack-button"
                                                    onClick={() => acknowledgeMessage(message.hash)}
                                                >
                                                    Acknowledge
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'sent' && (
                    <div className="messages-section">
                        <h2>Sent Messages</h2>
                        {sentMessages.length === 0 ? (
                            <div className="empty-state">
                                <p>No sent messages yet</p>
                            </div>
                        ) : (
                            <div className="messages-list">
                                {sentMessages.map((message) => (
                                    <div key={message.hash} className="message-card sent">
                                        <div className="message-header">
                                            <span className="message-to">To: {message.receiverDID}</span>
                                            <span className="message-time">
                                                {new Date(message.timestamp * 1000).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="message-body">
                                            {message.content ? (
                                                <p>{message.content}</p>
                                            ) : (
                                                <p style={{ fontStyle: 'italic', opacity: 0.7 }}>
                                                    {message.ipfsCid ? 'Content hidden' : 'Content unavailable (Historical)'}
                                                </p>
                                            )}
                                        </div>
                                        <div className="message-footer">
                                            {message.acknowledged ? (
                                                <span className="acknowledged">Read by recipient</span>
                                            ) : (
                                                <span className="pending">Pending (Unread)</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default MessagingDashboard;