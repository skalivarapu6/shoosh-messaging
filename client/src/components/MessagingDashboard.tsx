import { useState, useEffect, useRef, useMemo } from 'react';
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

    // Load sent messages from localStorage only (no blockchain fetching to avoid RPC limits)
    useEffect(() => {
        if (!myDID) return;

        const loadLocalMessages = () => {
            try {
                // Load previously sent messages from localStorage
                const savedSentStr = localStorage.getItem(`sent_messages_${myDID}`);
                if (savedSentStr) {
                    const savedSent = JSON.parse(savedSentStr);
                    setMessages(prev => {
                        const combined = [...prev, ...savedSent];
                        const unique = Array.from(
                            new Map(combined.map(m => [m.hash + m.isSent, m])).values()
                        );
                        return unique;
                    });
                }
            } catch (error) {
                console.error('Failed to load local messages:', error);
            }
        };

        loadLocalMessages();
    }, [myDID]);

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

    const encryptMessage = (content: string) => btoa(content);
    const decryptMessage = (encrypted: string) => {
        try { return atob(encrypted); } catch { return '[Unable to decrypt]'; }
    };

    const uploadToIPFS = async (content: string): Promise<string> => {
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
            return cid;
        }
    };

    const fetchFromIPFS = async (cid: string): Promise<string> => {
        if (cid.startsWith('local-')) {
            const encrypted = localStorage.getItem(`ipfs_${cid}`);
            if (!encrypted) throw new Error('Content not found');
            return decryptMessage(encrypted);
        }
        const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
        if (!response.ok) throw new Error('Failed to fetch from IPFS');
        const encrypted = await response.text();
        return decryptMessage(encrypted);
    };

    const handleSendMessage = async (targetDID: string, content: string) => {
        if (!targetDID || !content) return;

        setIsLoading(true);
        setStatusMessage('Sending...');

        try {
            const ipfsCid = await uploadToIPFS(content);
            const messageHash = keccak256(toUtf8Bytes(ipfsCid + content));

            const cidMapping = localStorage.getItem('ipfs_cid_mapping');
            const mapping = cidMapping ? JSON.parse(cidMapping) : {};
            mapping[messageHash] = ipfsCid;
            localStorage.setItem('ipfs_cid_mapping', JSON.stringify(mapping));

            try {
                await fetch('http://localhost:3001/store-cid', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messageHash,
                        ipfsCid,
                        senderDID: myDID,
                        receiverDID: targetDID
                    })
                });
            } catch (err) { console.warn('Failed to store on server', err); }

            writeContract({
                address: import.meta.env.VITE_MESSAGE_METADATA_ADDRESS as `0x${string}`,
                abi: MessageMetadataABI,
                functionName: 'sendMessageCommitment',
                args: [messageHash, targetDID],
            }, {
                onSuccess: () => {
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
            alert("Content unavailable (missing CID)");
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