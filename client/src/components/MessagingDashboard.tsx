import { useState, useEffect, useRef, useMemo, useRef, useCallback } from 'react';
import { useAccount, useWriteContract, useWatchContractEvent, usePublicClient } from 'wagmi';
import { MessageMetadataABI } from '../contracts/MessageMetadata';
import { keccak256, toUtf8Bytes } from 'ethers';
import { io, Socket } from 'socket.io-client';
import ReactMarkdown from 'react-markdown';
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
    isSent: boolean;
}

const MessagingDashboard = () => {
    const { address } = useAccount();
    const [messages, setMessages] = useState<Message[]>([]);
    const [selectedContact, setSelectedContact] = useState<string | null>(null);
    const [recipientDID, setRecipientDID] = useState('');
    const [messageContent, setMessageContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [showNewChatModal, setShowNewChatModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [decryptingId, setDecryptingId] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { writeContract } = useWriteContract();
    // const publicClient = usePublicClient();

    const myDID = address ? `did:eth:${address.toLowerCase()}` : '';

    const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY || '';
    const PINATA_SECRET_KEY = import.meta.env.VITE_PINATA_SECRET_KEY || '';

    const conversations = useMemo(() => {
        const groups = new Map<string, Message[]>();

        messages.forEach(msg => {
            const partner = msg.isSent ? msg.receiverDID : msg.senderDID;
            if (!groups.has(partner)) {
                groups.set(partner, []);
            }
            groups.get(partner)!.push(msg);
        });

        groups.forEach(msgs => {
            msgs.sort((a, b) => a.timestamp - b.timestamp);
        });

        return groups;
    }, [messages]);

    // Get sorted list of contacts based on last message timestamp
    const sortedContacts = useMemo(() => {
        const contacts = Array.from(conversations.keys());
        return contacts.sort((a, b) => {
            const msgsA = conversations.get(a)!;
            const msgsB = conversations.get(b)!;
            const lastA = msgsA[msgsA.length - 1].timestamp;
            const lastB = msgsB[msgsB.length - 1].timestamp;
            return lastB - lastA;
        }).filter(did => did.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [conversations, searchTerm]);

    useEffect(() => {
        if (selectedContact) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, selectedContact]);

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
        if (!myDID) return;
        if (!publicClient || !myDID || hasFetchedHistory.current) return;

        const socket: Socket = io('http://localhost:3001');

        socket.on('connect', () => { });

        socket.on('new-message', async (data: {
            messageHash: string;
            ipfsCid: string;
            senderDID: string;
            receiverDID: string;
            timestamp: number;
        }) => {
            if (data.receiverDID.toLowerCase() !== myDID.toLowerCase()) return;

            setMessages(prev => {
                if (prev.some(m => m.hash === data.messageHash && !m.isSent)) return prev;

                // Save CID mapping to localStorage so we can load it on refresh
                if (data.ipfsCid) {
                    const cidMappingStr = localStorage.getItem('ipfs_cid_mapping');
                    const cidMapping = cidMappingStr ? JSON.parse(cidMappingStr) : {};
                    cidMapping[data.messageHash] = data.ipfsCid;
                    localStorage.setItem('ipfs_cid_mapping', JSON.stringify(cidMapping));
                }

                let content: string | undefined;
                if (data.ipfsCid?.startsWith('local-')) {
                    const encrypted = localStorage.getItem(`ipfs_${data.ipfsCid}`);
                    if (encrypted) {
                        try {
                            content = atob(encrypted);
                        } catch (e) {
                            console.error('Failed to decrypt message', e);
                        }
                    }
                }
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

                            return [...prev, {
                                hash: data.messageHash,
                                senderDID: data.senderDID,
                                receiverDID: data.receiverDID,
                                timestamp: data.timestamp / 1000,
                                content,
                                ipfsCid: data.ipfsCid,
                                acknowledged: false,
                                isSent: false
                            }];
                        });
        });

        return () => {
            socket.disconnect();
        };
    }, [myDID]);
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
    setStatusMessage('Sending...');

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
            args: [messageHash, recipientDID, ipfsCid],
        }, {
            onSuccess: () => {
                setStatusMessage('✓ Message sent successfully!');
                setMessageContent('');
                setRecipientDID('');

                const newMessage: Message = {
                    hash: messageHash,
                    senderDID: myDID,
                    receiverDID: targetDID,
                    timestamp: Date.now() / 1000,
                    content: content,
                    ipfsCid,
                    acknowledged: false,
                    isSent: true,
                };

                setMessages(prev => {
                    const updated = [...prev, newMessage];
                    localStorage.setItem(`sent_messages_${myDID}`, JSON.stringify(updated.filter(m => m.isSent)));
                    return updated;
                });

                setMessageContent('');
                if (showNewChatModal) {
                    setShowNewChatModal(false);
                    setSelectedContact(targetDID);
                }
                setStatusMessage('');
            },
            onError: (error) => setStatusMessage(`Error: ${error.message}`),
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
        },
        onError: (error) => setStatusMessage(`Error: ${error.message}`),
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

    setDecryptingId(message.hash);

    // Simulate "AI processing/decryption" delay
    setTimeout(async () => {
        try {
            const content = await fetchFromIPFS(message.ipfsCid!);
            setMessages(prev =>
                prev.map(msg =>
                    msg.hash === message.hash ? { ...msg, content } : msg
                )
            );
        } catch (e) {
            console.error(e);
        } finally {
            setDecryptingId(null);
        }
    }, 800);
};

return (
    <div className="messaging-dashboard">
        <div className="dashboard-container">
            {/* Sidebar */}
            <div className={`sidebar ${!selectedContact ? 'mobile-visible' : ''}`}>
                <div className="sidebar-header">
                    <div className="sidebar-user-profile">
                        <div className="user-avatar-small">
                            {myDID.split(':').pop()?.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="user-profile-info">
                            <span className="user-label">My Identity</span>
                            <span className="user-did-full" title={myDID}>
                                {myDID}
                            </span>
                        </div>
                    </div>
                    <h2>Messages</h2>
                    <input
                        className="search-box"
                        placeholder="Search contacts..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <ul className="contacts-list">
                    {sortedContacts.map(did => {
                        const msgs = conversations.get(did)!;
                        const lastMsg = msgs[msgs.length - 1];
                        const unreadCount = msgs.filter(m => !m.isSent && !m.acknowledged).length;

                        return (
                            <li
                                key={did}
                                className={`contact-item ${selectedContact === did ? 'active' : ''}`}
                                onClick={() => setSelectedContact(did)}
                            >
                                <div className="contact-avatar">
                                    {did.split(':').pop()?.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="contact-info">
                                    <div className="contact-name">
                                        {did.substring(0, 16)}...{did.substring(did.length - 4)}
                                    </div>
                                    <div className="contact-preview">
                                        {lastMsg.content || (lastMsg.ipfsCid ? '🔒 Encrypted message' : 'Content unavailable')}
                                    </div>
                                </div>
                                <div className="contact-meta">
                                    <div className="contact-time">
                                        {new Date(lastMsg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    {unreadCount > 0 && (
                                        <div className="unread-badge">{unreadCount}</div>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {/* Main Chat Area */}
            <div className="main-content">
                {selectedContact ? (
                    <>
                        <div className="chat-header">
                            <div className="contact-avatar">
                                {selectedContact.split(':').pop()?.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="chat-header-info">
                                <h3>{selectedContact}</h3>
                                <p>Blockchain Identity</p>
                            </div>
                        </div>

                        <div className="messages-area">
                            <div className="messages-container">
                                {conversations.get(selectedContact)?.map((msg) => (
                                    <div key={`${msg.hash}-${msg.isSent}`} className={`message-bubble ${msg.isSent ? 'sent' : 'received'}`}>
                                        <div className="bubble-content">
                                            <div className={`bubble-text ${!msg.content ? 'unavailable' : ''}`}>
                                                {decryptingId === msg.hash ? (
                                                    <div className="typing-indicator">
                                                        <div className="typing-dot"></div>
                                                        <div className="typing-dot"></div>
                                                        <div className="typing-dot"></div>
                                                    </div>
                                                ) : msg.content ? (
                                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                                ) : (
                                                    <button
                                                        className="load-button"
                                                        onClick={() => loadMessageContent(msg)}
                                                    >
                                                        Load Content
                                                    </button>
                                                )}
                                            </div>
                                            <div className="bubble-meta">
                                                <span className="bubble-time">
                                                    {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                {msg.isSent && (
                                                    <span className={`bubble-status ${msg.acknowledged ? 'read' : 'pending'}`}>
                                                        {msg.acknowledged ? '✓✓' : '✓'}
                                                    </span>
                                                )}
                                            </div>
                                            {!msg.isSent && !msg.acknowledged && (
                                                <button
                                                    className="acknowledge-button"
                                                    onClick={() => acknowledgeMessage(msg.hash)}
                                                >
                                                    Mark as Read
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {isLoading && (
                                    <div className="message-bubble sent">
                                        <div className="bubble-content">
                                            <div className="typing-indicator">
                                                <div className="typing-dot"></div>
                                                <div className="typing-dot"></div>
                                                <div className="typing-dot"></div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        </div>

                        <div className="message-input-container">
                            <div className="message-input-wrapper">
                                <textarea
                                    className="message-input"
                                    placeholder="Type a message..."
                                    value={messageContent}
                                    onChange={(e) => setMessageContent(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage(selectedContact, messageContent);
                                        }
                                    }}
                                />
                                <button
                                    className="send-button"
                                    disabled={isLoading || !messageContent.trim()}
                                    onClick={() => handleSendMessage(selectedContact, messageContent)}
                                >
                                    Send
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="empty-state">
                        <div className="empty-state-icon">💬</div>
                        <div className="empty-state-text">Select a conversation</div>
                        <div className="empty-state-subtext">or start a new chat</div>
                    </div>
                )}
            </div>
        </div>

        {/* New Chat Button */}
        <button
            className="new-chat-button"
            onClick={() => setShowNewChatModal(true)}
        >
            +
        </button>

        {/* New Chat Modal */}
        {showNewChatModal && (
            <div className="modal-overlay" onClick={() => setShowNewChatModal(false)}>
                <div className="modal-content" onClick={e => e.stopPropagation()}>
                    <h2>Start New Chat</h2>
                    <input
                        className="form-input"
                        placeholder="Recipient DID (did:eth:0x...)"
                        value={recipientDID}
                        onChange={(e) => setRecipientDID(e.target.value)}
                    />
                    <textarea
                        className="form-textarea"
                        placeholder="First message..."
                        value={messageContent}
                        onChange={(e) => setMessageContent(e.target.value)}
                        style={{ marginTop: '1rem', height: '100px' }}
                    />
                    <div className="modal-actions">
                        <button onClick={() => setShowNewChatModal(false)}>Cancel</button>
                        <button
                            className="primary"
                            disabled={!recipientDID || !messageContent}
                            onClick={() => handleSendMessage(recipientDID, messageContent)}
                        >
                            Send Message
                        </button>
                    </div>
                </div>
            </div>
        )}

        {statusMessage && (
            <div className="status-message">
                {statusMessage}
            </div>
        )}
    </div>
);
};

export default MessagingDashboard;