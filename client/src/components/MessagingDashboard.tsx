import { useState } from 'react';
import { useAccount, useWriteContract, useWatchContractEvent } from 'wagmi';
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

    const myDID = address ? `did:eth:${address.toLowerCase()}` : '';

    // Pinata configuration for IPFS uploads
    const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY || '';
    const PINATA_SECRET_KEY = import.meta.env.VITE_PINATA_SECRET_KEY || '';

    // Watch for incoming messages
    useWatchContractEvent({
        address: import.meta.env.VITE_MESSAGE_METADATA_ADDRESS as `0x${string}`,
        abi: MessageMetadataABI,
        eventName: 'MessageSent',
        onLogs(logs) {
            logs.forEach((log) => {
                // @ts-ignore - wagmi's Log type doesn't include args, but it's available at runtime
                const args = log.args as unknown as {
                    messageHash: string;
                    senderDID: string;
                    receiverDID: string;
                    timestamp: bigint;
                };
                const { messageHash, senderDID, receiverDID, timestamp } = args;

                // Check if this message is for us
                if (receiverDID.toLowerCase() === myDID.toLowerCase()) {
                    const newMessage: Message = {
                        hash: messageHash,
                        senderDID,
                        receiverDID,
                        timestamp: Number(timestamp),
                        acknowledged: false,
                        isSent: false,
                    };

                    setMessages(prev => {
                        // Avoid duplicates
                        if (prev.some(m => m.hash === messageHash)) return prev;
                        return [...prev, newMessage];
                    });
                }

                // Also track messages we sent
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
                        if (prev.some(m => m.hash === messageHash)) return prev;
                        return [...prev, sentMessage];
                    });
                }
            });
        },
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

            // 3. Send commitment to blockchain
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
                    setMessages(prev => [...prev, newMessage]);

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
                setMessages(prev =>
                    prev.map(msg =>
                        msg.hash === messageHash ? { ...msg, acknowledged: true } : msg
                    )
                );
                setStatusMessage('✓ Message acknowledged!');
                setTimeout(() => setStatusMessage(''), 3000);
            },
            onError: (error) => {
                setStatusMessage(`Error: ${error.message}`);
            },
        });
    };

    const loadMessageContent = async (message: Message) => {
        if (message.content || !message.ipfsCid) return;

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
                                                    📂 Load Message
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
                                            {message.content && <p>{message.content}</p>}
                                        </div>
                                        <div className="message-footer">
                                            {message.acknowledged ? (
                                                <span className="acknowledged">✓ Read by recipient</span>
                                            ) : (
                                                <span className="pending">⏳ Pending</span>
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