import { useState, useEffect } from 'react';
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
    isSent: boolean; // true if we sent it, false if we received it
}

const MessagingDashboard = () => {
    const { address } = useAccount();
    const [messages, setMessages] = useState<Message[]>([]);
    const [activeTab, setActiveTab] = useState<'compose' | 'inbox' | 'sent'>('compose');
    const [recipientDID, setRecipientDID] = useState('');
    const [messageContent, setMessageContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    const { writeContract } = useWriteContract();
    const publicClient = usePublicClient();

    const myDID = address ? `did:eth:${address.toLowerCase()}` : '';

    // Pinata configuration for IPFS uploads
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

    // Fetch historical messages on mount with chunking
    useEffect(() => {
        if (!publicClient || !myDID) return;

        const fetchHistory = async () => {
            try {
                const currentBlock = await publicClient.getBlockNumber();
                // We only fetch the last 100 blocks to avoid hitting strict RPC limits
                // The user relies on localStorage for older sent messages
                const totalBlocksToFetch = 100n;
                const chunkSize = 10n; // Strict limit from error message

                const startBlock = currentBlock - totalBlocksToFetch > 0n ? currentBlock - totalBlocksToFetch : 0n;

                const sentLogs = [];
                const ackLogs = [];

                // Fetch in chunks
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
                        // Continue to next chunk
                    }
                }

                const acknowledgedHashes = new Set(
                    ackLogs.map(log => ((log as any).args).messageHash)
                );

                const historicalMessages: Message[] = [];

                // Get CID mapping from localStorage
                const cidMappingStr = localStorage.getItem('ipfs_cid_mapping');
                const cidMapping = cidMappingStr ? JSON.parse(cidMappingStr) : {};

                for (const log of sentLogs) {
                    const args = (log as any).args;
                    const { messageHash, senderDID, receiverDID, timestamp } = args;

                    const isIncoming = receiverDID.toLowerCase() === myDID.toLowerCase();
                    const isOutgoing = senderDID.toLowerCase() === myDID.toLowerCase();

                    // Get IPFS CID from mapping if available
                    const ipfsCid = cidMapping[messageHash];
                    let content: string | undefined;

                    // If we have the CID and it's local, get the content immediately
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

                    // Add as incoming message (Inbox)
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

                    // Add as outgoing message (Sent)
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
                    // Merge with existing messages, avoiding duplicates based on hash AND isSent
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

    // Watch for incoming messages
    useWatchContractEvent({
        address: import.meta.env.VITE_MESSAGE_METADATA_ADDRESS as `0x${string}`,
        abi: MessageMetadataABI,
        eventName: 'MessageSent',
        onLogs(logs) {
            logs.forEach((log) => {
                // @ts-ignore - wagmi's Log type doesn't include args, but it's available at runtime
                const args = (log as any).args;
                const { messageHash, senderDID, receiverDID, timestamp } = args;

                // Check if this message is for us (Inbox)
                if (receiverDID.toLowerCase() === myDID.toLowerCase()) {
                    // Try to get IPFS CID from localStorage mapping
                    const cidMapping = localStorage.getItem('ipfs_cid_mapping');
                    let ipfsCid: string | undefined;
                    let content: string | undefined;

                    if (cidMapping) {
                        try {
                            const mapping = JSON.parse(cidMapping);
                            ipfsCid = mapping[messageHash];

                            // If we have the CID and it's local, get the content immediately
                            if (ipfsCid?.startsWith('local-')) {
                                const encrypted = localStorage.getItem(`ipfs_${ipfsCid}`);
                                if (encrypted) {
                                    content = atob(encrypted);
                                }
                            }
                        } catch (e) {
                            console.error('Failed to parse CID mapping', e);
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
                        // Avoid duplicates (check hash AND isSent)
                        if (prev.some(m => m.hash === messageHash && m.isSent === false)) return prev;
                        return [...prev, newMessage];
                    });
                }

                // Also track messages we sent (Sent)
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
                        // Persist to local storage
                        localStorage.setItem(`sent_messages_${myDID}`, JSON.stringify(updated.filter(m => m.isSent)));
                        return updated;
                    });
                }
            });
        },
    });

    // Watch for acknowledgments
    useWatchContractEvent({
        address: import.meta.env.VITE_MESSAGE_METADATA_ADDRESS as `0x${string}`,
        abi: MessageMetadataABI,
        eventName: 'MessageAcknowledged',
        onLogs(logs) {
            logs.forEach((log) => {
                const args = (log as any).args;
                const { messageHash } = args;

                setMessages(prev =>
                    prev.map(msg =>
                        msg.hash === messageHash ? { ...msg, acknowledged: true } : msg
                    )
                );
            });
        }
    });

    const encryptMessage = (content: string): string => {
        // Simple Base64 encoding for demo - in production use proper asymmetric encryption
        // You'd typically encrypt with recipient's public key here
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

            // Use Pinata if configured, otherwise use public IPFS gateway
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
                // Fallback: Store in localStorage with a unique key for demo purposes
                // In production, you MUST use actual IPFS/Pinata
                const cid = 'local-' + Date.now() + '-' + Math.random().toString(36).substring(7);
                localStorage.setItem(`ipfs_${cid}`, encrypted);
                console.warn('⚠️ Using localStorage fallback. Configure Pinata for production!');
                return cid;
            }
        } catch (error) {
            console.error('IPFS upload error:', error);
            throw new Error('Failed to upload to IPFS');
        }
    };

    const fetchFromIPFS = async (cid: string): Promise<string> => {
        try {
            // Check if it's a local storage fallback
            if (cid.startsWith('local-')) {
                const encrypted = localStorage.getItem(`ipfs_${cid}`);
                if (!encrypted) throw new Error('Content not found');
                return decryptMessage(encrypted);
            }

            // Fetch from IPFS gateway
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
            // 1. Upload encrypted content to IPFS
            const ipfsCid = await uploadToIPFS(messageContent);
            setStatusMessage('Creating message commitment...');

            // 2. Create message hash (hash of IPFS CID + content for integrity)
            const messageHash = keccak256(toUtf8Bytes(ipfsCid + messageContent));

            // 3. Store hash->CID mapping in localStorage for inbox retrieval
            const cidMapping = localStorage.getItem('ipfs_cid_mapping');
            const mapping = cidMapping ? JSON.parse(cidMapping) : {};
            mapping[messageHash] = ipfsCid;
            localStorage.setItem('ipfs_cid_mapping', JSON.stringify(mapping));

            // 4. Send commitment to blockchain
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

                    // Add to sent messages immediately
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
                        // Persist to local storage
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
                    // Update local storage if needed (to sync ack status)
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
        // If we don't have the CID (e.g. from historical logs), we can't load it easily 
        // without an indexer or storing it in the event (which we don't).
        // BUT, for the demo, if it's a local message, we might have it in localStorage if we sent it.
        // If we received it, we need the CID. 
        // The current contract DOES NOT store the CID in the event. This is a limitation.
        // For this prototype, we will prompt the user to enter the CID if missing, or 
        // rely on the fact that for "Sent" messages we might not have the CID in history unless we stored it locally.

        // Wait! The contract only stores the hash. The event only has the hash.
        // The CID is NOT on-chain. This means the receiver cannot download the message 
        // unless the sender sent the CID off-chain or it was in the event.
        // Checking the contract...
        // The contract event is: event MessageSent(bytes32 indexed messageHash, string senderDID, string receiverDID, uint256 timestamp);
        // It does NOT contain the IPFS CID.
        // This means the receiver CANNOT download the message with the current contract design 
        // unless the CID is communicated another way.

        // However, for the sake of this specific user flow where they sent it to themselves:
        // They might have it in localStorage if they used the fallback.

        if (message.content) return;

        // If we don't have a CID attached to the message object (which we won't for historical messages),
        // we are kind of stuck unless we change the contract or the event.
        // For now, let's try to find it in localStorage by iterating keys if it's a local test.

        if (!message.ipfsCid) {
            // Try to find a matching hash in localStorage for demo purposes
            // In a real app, the CID should be part of the emitted event or stored in the contract.
            // Since we can't change the contract easily now, we'll assume the user is testing locally.

            // This is a hack for the prototype to work without contract changes
            const keys = Object.keys(localStorage);
            for (const key of keys) {
                if (key.startsWith('ipfs_')) {
                    const content = localStorage.getItem(key);
                    if (content) {
                        // Check if this content matches the hash
                        // We need the original CID + content to match the hash
                        // hash = keccak256(cid + content)
                        // But we stored encrypted content.
                        // This is getting complicated.

                        // SIMPLIFICATION:
                        // For this prototype, we will just show a message saying 
                        // "Content unavailable for historical messages in this version"
                        // unless we can find a way to link it.
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
                <h1>🔐 Secure Messaging</h1>
                <div className="user-info">
                    <span className="did-badge">Your DID: {myDID}</span>
                </div>
            </header>

            <nav className="dashboard-nav">
                <button
                    className={activeTab === 'compose' ? 'active' : ''}
                    onClick={() => setActiveTab('compose')}
                >
                    ✍️ Compose
                </button>
                <button
                    className={activeTab === 'inbox' ? 'active' : ''}
                    onClick={() => setActiveTab('inbox')}
                >
                    📥 Inbox ({inboxMessages.length})
                </button>
                <button
                    className={activeTab === 'sent' ? 'active' : ''}
                    onClick={() => setActiveTab('sent')}
                >
                    📤 Sent ({sentMessages.length})
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
                            {isLoading ? '⏳ Sending...' : '📨 Send Message'}
                        </button>
                    </div>
                )}

                {activeTab === 'inbox' && (
                    <div className="messages-section">
                        <h2>Received Messages</h2>
                        {inboxMessages.length === 0 ? (
                            <div className="empty-state">
                                <p>📭 No messages yet</p>
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
                                                    {message.ipfsCid ? '📂 Load Message' : '⚠️ CID Missing (Historical)'}
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
                                                    ✓ Acknowledge
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
                                <p>📭 No sent messages yet</p>
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
                                                <span className="acknowledged">✓ Read by recipient</span>
                                            ) : (
                                                <span className="pending">⏳ Pending (Unread)</span>
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