import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
    const [selectedPeerDID, setSelectedPeerDID] = useState<string | null>(null);
    const [newChatInput, setNewChatInput] = useState('');
    const [isCreatingNew, setIsCreatingNew] = useState(false);

    // Chat input state
    const [messageContent, setMessageContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    // Refs
    const hasFetchedHistory = useRef(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { writeContract } = useWriteContract();
    const publicClient = usePublicClient();

    const myDID = address ? `did:eth:${address.toLowerCase()}` : '';

    const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY || '';
    const PINATA_SECRET_KEY = import.meta.env.VITE_PINATA_SECRET_KEY || '';

    // Scroll to bottom of chat
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, selectedPeerDID]);

    // Derived state: Group messages by conversation (peer DID)
    const conversations = useMemo(() => {
        const groups: { [key: string]: Message[] } = {};

        messages.forEach(msg => {
            const peer = msg.isSent ? msg.receiverDID : msg.senderDID;
            if (!groups[peer]) {
                groups[peer] = [];
            }
            groups[peer].push(msg);
        });

        // Convert to array and sort by latest message timestamp
        return Object.entries(groups)
            .map(([peerDID, msgs]) => ({
                peerDID,
                messages: msgs.sort((a, b) => a.timestamp - b.timestamp),
                lastMessage: msgs.reduce((latest, current) =>
                    current.timestamp > latest.timestamp ? current : latest, msgs[0])
            }))
            .sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp);
    }, [messages]);

    // Load locally saved messages
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

    // Fetch history from chain
    useEffect(() => {
        if (!publicClient || !myDID || hasFetchedHistory.current) return;

        const fetchHistory = async () => {
            try {
                hasFetchedHistory.current = true;
                const currentBlock = await publicClient.getBlockNumber();
                const totalBlocksToFetch = 200n; // Reduced to comply with RPC rate limits
                const chunkSize = 5n; // Alchemy free tier supports max 10 blocks range

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

                    if (isIncoming || isOutgoing) {
                        historicalMessages.push({
                            hash: messageHash,
                            senderDID,
                            receiverDID,
                            timestamp: Number(timestamp),
                            acknowledged: acknowledgedHashes.has(messageHash),
                            isSent: isOutgoing,
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

    // Event Listeners
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

    // Helpers
    const encryptMessage = (content: string): string => btoa(content);
    const decryptMessage = (encrypted: string): string => {
        try { return atob(encrypted); } catch { return '[Unable to decrypt message]'; }
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

    // Actions
    const sendMessage = async () => {
        if (!selectedPeerDID || !messageContent) return;

        if (!selectedPeerDID.startsWith('did:eth:')) {
            setStatusMessage('Invalid DID format.');
            return;
        }

        setIsLoading(true);

        try {
            const ipfsCid = await uploadToIPFS(messageContent);
            const messageHash = keccak256(toUtf8Bytes(ipfsCid + messageContent));

            // Store CID mapping locally/server for retrieval
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
            } catch (err) { console.warn("Failed to store CID on server", err); }

            writeContract({
                address: import.meta.env.VITE_MESSAGE_METADATA_ADDRESS as `0x${string}`,
                abi: MessageMetadataABI,
                functionName: 'sendMessageCommitment',
                args: [messageHash, selectedPeerDID, ipfsCid],
            }, {
                onSuccess: () => {
                    setMessageContent('');
                    const newMessage: Message = {
                        hash: messageHash,
                        senderDID: myDID,
                        receiverDID: selectedPeerDID,
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
                },
                onError: (error) => {
                    alert(`Error sending: ${error.message}`);
                },
            });
        } catch (error: any) {
            alert(`Error: ${error.message}`);
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
            }
        });
    };

    const loadMessageContent = async (message: Message) => {
        if (message.content) return;
        if (!message.ipfsCid) {
            alert("CID Missing for historical message.");
            return;
        }

        const content = await fetchFromIPFS(message.ipfsCid);
        setMessages(prev =>
            prev.map(msg =>
                msg.hash === message.hash ? { ...msg, content } : msg
            )
        );
    };

    const startNewChat = () => {
        if (newChatInput) {
            setSelectedPeerDID(newChatInput);
            setNewChatInput('');
            setIsCreatingNew(false);
        }
    };

    const activeMessages = selectedPeerDID
        ? conversations.find(c => c.peerDID === selectedPeerDID)?.messages || []
        : [];

    const sortedActiveMessages = [...activeMessages].sort((a, b) => a.timestamp - b.timestamp);

    return (
        <div className="app-container">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="my-identity">
                        <div className="avatar">0X</div>
                        <div className="identity-info">
                            <h3>My Identity</h3>
                            <p className="did-truncate" title={myDID}>{myDID}</p>
                        </div>
                    </div>
                </div>

                <div className="conversations-list">
                    <div className="list-header">
                        <h3>Messages</h3>
                    </div>

                    {isCreatingNew ? (
                        <div className="new-chat-input">
                            <input
                                autoFocus
                                type="text"
                                placeholder="Enter DID (did:eth:0x...)"
                                value={newChatInput}
                                onChange={e => setNewChatInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && startNewChat()}
                            />
                            <div className="new-chat-actions">
                                <button onClick={startNewChat}>Start</button>
                                <button onClick={() => setIsCreatingNew(false)} className="cancel">X</button>
                            </div>
                        </div>
                    ) : (
                        <button className="new-chat-btn" onClick={() => setIsCreatingNew(true)}>
                            + New Message
                        </button>
                    )}

                    {conversations.map(convo => (
                        <div
                            key={convo.peerDID}
                            className={`conversation-item ${selectedPeerDID === convo.peerDID ? 'active' : ''}`}
                            onClick={() => setSelectedPeerDID(convo.peerDID)}
                        >
                            <div className="avatar-small">0X</div>
                            <div className="convo-info">
                                <p className="peer-did">{convo.peerDID.replace('did:eth:', '').substring(0, 10)}...</p>
                                <p className="last-msg-preview">
                                    {convo.lastMessage.isSent ? 'You: ' : ''}
                                    {convo.lastMessage.content ? convo.lastMessage.content.substring(0, 15) + '...' : '[Encrypted]'}
                                </p>
                            </div>
                            <div className="convo-meta">
                                <span className="time">
                                    {new Date(convo.lastMessage.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </aside>

            <main className="chat-window">
                {selectedPeerDID ? (
                    <>
                        <header className="chat-header">
                            <div className="avatar">0X</div>
                            <div className="chat-info">
                                <h2>{selectedPeerDID}</h2>
                                <p>Blockchain Identity</p>
                            </div>
                        </header>

                        <div className="messages-container">
                            {sortedActiveMessages.length === 0 && (
                                <div className="empty-chat-state">
                                    <p>No messages yet. Start the conversation!</p>
                                </div>
                            )}

                            {sortedActiveMessages.map(msg => (
                                <div key={msg.hash} className={`message-row ${msg.isSent ? 'sent' : 'received'}`}>
                                    <div className="message-bubble">
                                        {!msg.content ? (
                                            <button className="load-content-btn" onClick={() => loadMessageContent(msg)}>
                                                Load Content
                                            </button>
                                        ) : (
                                            <p>{msg.content}</p>
                                        )}

                                        <div className="message-meta">
                                            <span className="timestamp">
                                                {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            {msg.isSent && (
                                                <span className="status-icon">
                                                    {msg.acknowledged ? '✓✓' : '✓'}
                                                </span>
                                            )}
                                            {!msg.isSent && !msg.acknowledged && (
                                                <button className="ack-btn-small" onClick={() => acknowledgeMessage(msg.hash)}>
                                                    Mark Read
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="chat-input-area">
                            <input
                                type="text"
                                placeholder="Type a message..."
                                value={messageContent}
                                onChange={e => setMessageContent(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && !isLoading && sendMessage()}
                                disabled={isLoading}
                            />
                            <button
                                className="send-fab"
                                onClick={sendMessage}
                                disabled={isLoading || !messageContent}
                            >
                                {isLoading ? '...' : 'Send'}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="no-chat-selected">
                        <h2>Select a conversation to start messaging</h2>
                    </div>
                )}
            </main>
        </div>
    );
};

export default MessagingDashboard;