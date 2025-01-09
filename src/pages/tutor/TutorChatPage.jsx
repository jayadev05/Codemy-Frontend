import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  MoreHorizontal,
  Search,
  Bell,
  Check,
  CheckCheck,
  AlertTriangle,
  Trash2Icon,
  ImageIcon,
  X,
  Video,
} from "lucide-react";
import { socketService } from "@/services/socket";
import { useSelector } from "react-redux";
import { selectUser } from "@/store/slices/userSlice";
import axiosInstance from "@/config/axiosConfig";
import { jwtDecode } from "jwt-decode";
import Sidebar from "@/components/layout/tutor/Sidebar";
import { selectTutor } from "@/store/slices/tutorSlice";
import TypingIndicator from "@/components/utils/TypingIndicator";
import toast from "react-hot-toast";
import { handleChatDeletion } from "@/utils/ChatUtils";
import { updateChatsList } from "@/utils/ChatUtils";
import ComposeModalUser from "@/components/layout/tutor/chat/StudentList";
import axios from "axios";
import VideoCallInterface from "@/components/layout/videoCall/VideoCallIInterface";
import SimplePeer from "simple-peer/simplepeer.min.js";
import TutorHeader from "@/components/layout/tutor/TutorHeader";

export default function TutorChatPage() {
  const tutor = useSelector(selectTutor);
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [selectedChat, setSelectedChat] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [students, setStudents] = useState([]);
  const [typingTimeout, setTypingTimeout] = useState(null);
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const fileInputRef = useRef(null);
  const [progress, setProgress] = useState(0);

  const messagesEndRef = useRef(null);

  //video call
  const myVideoRef = useRef();
  const peerVideoRef = useRef();
  const connectionRef = useRef();

  const [stream, setStream] = useState(null);
  const [isCalling, setIsCalling] = useState(false);
  const [isCallAccepted, setIsCallAccepted] = useState(false);
  const [incomingCallInfo, setIncomingCallInfo] = useState({});
  const [outgoingCallInfo, setoutgoingCallInfo] = useState({});
  const [isCallActive, setIsCallActive] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  console.log("My socket id :", socketService.socket?.id);

  //get current user role
  const userType = getUserRoleFromToken();

  const receiverId =
    userType === "user"
      ? selectedChat?.tutorId?._id
      : selectedChat?.userId?._id;

  //handling video call
  useEffect(() => {
    const handleIncomingCall = async (data) => {
      try {
        console.log("Incoming call from:", data.from);
        
        // First ensure we have valid data
        if (!data?.from || !data?.callerData || !data?.signalData) {
          console.error("Invalid incoming call data received");
          return;
        }
    
        // Acknowledge the call first
        await socketService.acknowledgeCall(data.from);
    
        // Then update the UI state
        setIncomingCallInfo({
          isSomeoneCalling: true,
          from: data.from,
          callerData: data.callerData,
          signalData: data.signalData,
        });
    
      } catch (error) {
        console.error("Error handling incoming call:", error);
        // Optionally notify the caller about the failure
        socketService.socket?.emit("call-failed", {
          to: data.from,
          reason: "Failed to process incoming call"
        });
      }
    };

    const handleCallAccepted = ({ signalData }) => {
      setIsCallAccepted(true);
      setIsCalling(false);

      if (connectionRef.current) {
        connectionRef.current.signal(signalData);
      }
    };

    const handleCallRejected = () => {
      toast.error("Call declined", { icon: "📞" });
      handleEndCall();
    };

    const handleCallEnded = () => {
      toast.error("Call ended", { icon: "📞" });
      handleEndCall(false);
    };

    const handleUserDisconnected = () => {
      if (isCallActive) {
        toast.error("Call ended: User disconnected");
        handleEndCall();
      }
    };

    console.log("Setting up socket event listeners");
    socketService.on("incoming-call", handleIncomingCall);
    socketService.on("call-accepted", handleCallAccepted);
    socketService.on("call-rejected", handleCallRejected);
    socketService.on("call-ended", handleCallEnded);
    socketService.on("user-disconnected", handleUserDisconnected);

    return () => {
      console.log("Cleaning up socket event listeners");
      socketService.off("incoming-call", handleIncomingCall);
      socketService.off("call-accepted", handleCallAccepted);
      socketService.off("call-rejected", handleCallRejected);
      socketService.off("call-ended", handleCallEnded);
      socketService.off("user-disconnected", handleUserDisconnected);
    };
  }, [stream, incomingCallInfo?.isSomeoneCalling]);

  //fetch students
  useEffect(() => {
    fetchStudents();
  }, []);

  // Scroll to bottom when messages update or typing status changes
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping]);

  // Initialize chat data and socket connection
  useEffect(() => {
    let isSubscribed = true;
    let currentTypingTimeout = null;

    const handleStatusUpdate = async () => {
      console.log("Other user is online", isSubscribed);
      if (isSubscribed) {
        console.log("fetching chats");
        await fetchChats();
      }
    };

    const handleRecieveMessage = (message) => {
      if (!isSubscribed) return;

      console.log("Received message event triggered:", message);

      const validatedMessage = {
        ...message,
        contentType: message.contentType || "text", // Default to text for backward compatibility
      };

      updateChatLastMessage(validatedMessage);
      fetchChats();

      setSelectedChat((currentSelectedChat) => {
        if (currentSelectedChat?._id === message.chatId) {
          setMessages((prevMessages) => {
            // Check for duplicate messages
            if (prevMessages.some((m) => m._id === message._id)) {
              return prevMessages;
            }
            return [...prevMessages, validatedMessage];
          });

          socketService.markMessagesRead({
            chatId: currentSelectedChat._id,
            userType,
            userId: tutor._id,
          });
        } else {
          // Update unread counts for non-selected chats
          setChats((prevChats) =>
            prevChats.map((chat) => {
              if (chat._id === message.chatId) {
                const isFromOtherUser = message.sender.userId !== tutor._id;
                const isNotCurrentChat = currentSelectedChat?._id !== chat._id;

                return {
                  ...chat,
                  unreadCount: {
                    ...chat.unreadCount,
                    [userType === "user" ? "student" : "tutor"]:
                      isFromOtherUser && isNotCurrentChat
                        ? (chat.unreadCount?.[
                            userType === "user" ? "student" : "tutor"
                          ] || 0) + 1
                        : chat.unreadCount?.[
                            userType === "user" ? "student" : "tutor"
                          ] || 0,
                  },
                };
              }
              return chat;
            })
          );
        }

        return currentSelectedChat;
      });
    };

    const handleTyping = ({ senderId }) => {
      if (!isSubscribed) return;
      console.log("Typing event received from:", senderId);
      setIsTyping(true);
    };

    const handleStopTyping = ({ senderId }) => {
      if (!isSubscribed) return;
      console.log("Stop typing event received from:", senderId);
      setIsTyping(false);
    };

    const handleMessageDelivered = (data) => {
      if (!isSubscribed || !data?.messageIds?.length) return;

      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          data.messageIds.includes(msg._id)
            ? { ...msg, status: "delivered" }
            : msg
        )
      );
    };

    const handleMessageRead = (data) => {
      if (!isSubscribed || !data) return;

      const { chatId, userType, unreadCount, messageIds = [] } = data;
      console.log("message-read event received:", {
        chatId,
        userType,
        unreadCount,
        messageIds,
      });

      setChats((prevChats) =>
        prevChats.map((chat) =>
          chat._id === chatId ? { ...chat, unreadCount } : chat
        )
      );

      if (messageIds.length > 0) {
        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            messageIds.includes(msg._id) ? { ...msg, status: "read" } : msg
          )
        );
      }
    };

    const initializeChat = async () => {
      if (!tutor?._id) return;

      console.log("Socket connection initialized");

      setLoading(true);
      await fetchChats();
      setLoading(false);

      // Only attach listeners if still subscribed
      if (isSubscribed) {
        socketService.on("user-status-update", handleStatusUpdate);
        socketService.on("receive-message", handleRecieveMessage);
        socketService.on("message-delivered", handleMessageDelivered);
        socketService.on("message-read", handleMessageRead);
        socketService.on("typing", handleTyping);
        socketService.on("stop-typing", handleStopTyping);
      }
    };

    initializeChat();

    // Cleanup function
    return () => {
      isSubscribed = false;

      socketService.off("user-status-update", handleStatusUpdate);
      socketService.off("receive-message", handleRecieveMessage);
      socketService.off("message-read", handleMessageRead);
      socketService.off("message-delivered", handleMessageDelivered);
      socketService.off("typing", handleTyping);
      socketService.off("stop-typing", handleStopTyping);

      if (currentTypingTimeout) {
        clearTimeout(currentTypingTimeout);
      }
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
    };
  }, [tutor?._id, selectedChat?._id]);

  //get userType form token
  function getUserRoleFromToken() {
    const token = localStorage.getItem("accessToken");
    if (token) {
      try {
        const decodedToken = jwtDecode(token);
        return decodedToken.type;
      } catch (error) {
        console.error("Invalid token:", error);
      }
    }
    return null;
  }

  // Fetch all chats for the current user
  const fetchChats = async () => {
    try {
      const response = await axiosInstance.get(`/chat/chats/${tutor._id}`);

      const filteredChat = response.data.filter((chat) => {
        if (chat.deletedBy.length > 0) {
          return !chat.deletedBy.includes(tutor._id);
        }
        return true;
      });

      setChats(filteredChat);

      if (selectedChat) {
        console.log(selectedChat);

        const chatStillExists = filteredChat.find(
          (chat) => chat._id === selectedChat._id
        );
        console.log("chat exists?", chatStillExists);

        if (!chatStillExists) {
          setSelectedChat(null);
          console.log("no chat");
        } else {
          const updatedSelectedChat = filteredChat.find(
            (chat) => chat._id === selectedChat._id
          );
          setSelectedChat(updatedSelectedChat);
          console.log("selected chat is updated", updatedSelectedChat);
        }
      } else {
        console.log("no selected chat");
      }
    } catch (error) {
      console.error("Error fetching chats:", error);
    }
  };

  // Fetch messages for a specific chat
  const fetchMessages = async (chatId) => {
    try {
      const response = await axiosInstance.get(`/chat/${chatId}/messages`);
      console.log(response);
      setMessages(response.data);
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  // Fetch tutors when modal opens
  const fetchStudents = async () => {
    try {
      setLoading(true);

      const response = await axiosInstance.get(`/chat/tutor/${tutor._id}/students`);

      setStudents(response.data.students);
    } catch (error) {
      console.error("Error fetching tutors:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChat = (newChat) => {
    setChats((prev) => [newChat, ...prev]);
    setSelectedChat(newChat);
    fetchMessages(newChat._id);
  };

  // Update chat's last message
  const updateChatLastMessage = (message) => {
    setChats((prevChats) =>
      prevChats.map((chat) =>
        chat._id === message.chatId
          ? {
              ...chat,
              lastMessage: {
                content: message.content,
                contentType: message.contentType,
                senderId: message.sender.userId,
                timestamp: message.createdAt,
              },
            }
          : chat
      )
    );
  };

  const markMessagesAsRead = async (chatId, userType) => {
    try {
      await axiosInstance.put(`/chat/messages/read`, {
        chatId,
        userType,
      });

      socketService.markMessagesRead({
        chatId,
        userType,
        userId: tutor._id,
      });

      setChats((prevChats) =>
        prevChats.map((chat) => {
          if (chat._id === chatId) {
            return {
              ...chat,
              unreadCount: {
                ...chat.unreadCount,
                [userType === "user" ? "student" : "tutor"]: 0,
              },
            };
          }
          return chat;
        })
      );
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  };

  // Handle chat selection
  const handleChatSelect = async (chat) => {
    try {
      // Fetch messages before updating selectedChat
      const response = await axiosInstance.get(`/chat/chats/${chat._id}/messages`);

      // Update messages first
      setMessages(response.data);

      // Then update selectedChat
      setSelectedChat(chat);

      // Mark messages as read
      const hasUnreadMessages =
        chat.unreadCount?.[userType === "user" ? "student" : "tutor"] > 0;
      if (hasUnreadMessages) {
        await markMessagesAsRead(chat._id, userType);
      }
    } catch (error) {
      console.error("Error in chat selection:", error);
    }
  };

  // Handle sending messages
  const handleSendMessage = async (e) => {
    e.preventDefault();

    if ((!inputMessage.trim() && !selectedFile) || !selectedChat) return;

    try {
      const messageData = {
        chatId: selectedChat._id,
        sender: {
          userId: tutor._id,
          role: userType,
        },
        receiver: {
          userId:
            userType === "user"
              ? selectedChat.tutorId._id
              : selectedChat.userId._id,
          role: userType === "user" ? "tutor" : "user",
        },
        content: selectedFile || inputMessage.trim(),
        contentType: selectedFile ? "media" : "text", // Explicitly set content type
      };

      console.log("Sending message with data:", messageData);

      const response = await axiosInstance.post(
        "/chat/messages",
        messageData
      );

      // Ensure contentType exists in the response data
      const validatedResponse = {
        ...response.data,
        contentType:
          response.data.contentType || (selectedFile ? "media" : "text"),
      };

      console.log("validated response", validatedResponse);

      setMessages((prevMessages) => [...prevMessages, validatedResponse]);
      setInputMessage("");
      clearSelectedFile();
      updateChatLastMessage(validatedResponse);
      fetchChats();

      socketService.sendMessage({
        ...validatedResponse,
        timestamps: validatedResponse.createdAt,
      });
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
    }
  };

  // Handle typing events
  const handleTyping = () => {
    if (selectedChat) {
      socketService.sendTyping({
        chatId: selectedChat._id,
        senderId: tutor._id,
        receiverId: receiverId,
      });

      // Clear existing timeout
      if (typingTimeout) clearTimeout(typingTimeout);

      // Set new timeout to stop typing
      const timeout = setTimeout(() => {
        socketService.sendStopTyping({
          chatId: selectedChat._id,
          senderId: tutor._id,
          receiverId: receiverId,
        });
      }, 1000);

      setTypingTimeout(timeout);
    }
  };

  //deleting chat
  const handleDeleteChat = async () => {
    await handleChatDeletion(selectedChat._id, tutor._id, axiosInstance, {
      onSuccess: () => {
        setSelectedChat(null);
        setChats((prevChats) => updateChatsList(prevChats, selectedChat._id));
        setOptionsModalOpen(false);
      },
      onError: () => toast.error("Failed to delete chat"),
    });
  };

  const handleOptionsModalOpen = () => {
    setOptionsModalOpen(!optionsModalOpen);
  };

  const MessageStatus = ({ status }) => {
    if (!status || status === "sent") {
      return <Check className="h-4 w-4 text-gray-400" />;
    } else if (status === "delivered") {
      return <CheckCheck className="h-4 w-4 text-gray-400" />;
    } else if (status === "read") {
      return <CheckCheck className="h-4 w-4 text-blue-500" />;
    }
    return null;
  };

  const renderMessageContent = (message) => {
    // Always default to text if no contentType specified
    const contentType = message.contentType || "text";

    switch (contentType) {
      case "text":
        return <p>{message.content}</p>;

      case "media":
        if (typeof message.content === "string") {
          if (message.content.match(/\.(jpg|jpeg|png|gif)$/i)) {
            return (
              <img
                src={message.content}
                alt="Shared media"
                className="max-w-[300px] rounded-lg cursor-pointer"
                onClick={() => window.open(message.content, "_blank")}
              />
            );
          }

          if (message.content.match(/\.(mp4)$/i)) {
            return (
              <video controls className="max-w-[300px] rounded-lg">
                <source src={message.content} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            );
          }
        }
        return <p>Unsupported media format</p>;

      default:
        return <p>{message.content}</p>; // Fallback to showing content as text
    }
  };

  const handleFileUploadToCloudinary = async (file, fileType = "image") => {
    try {
      const cloudName = "diwjeqkca";
      const uploadPreset = "unsigned_upload";

      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", uploadPreset);

      // Add specific handling for PDFs
      if (fileType === "file" && file.type === "application/pdf") {
        formData.append("resource_type", "auto");
        // Add a flag to indicate this is a document
        formData.append("flags", "attachment");
      }

      const res = await axios.post(
        `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
        formData,
        {
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setProgress(percentCompleted);
          },
        }
      );

      // For PDFs, construct a special URL that forces download/display
      if (fileType === "file" && file.type === "application/pdf") {
        // Add fl_attachment to force proper PDF handling
        const url = res.data.secure_url.replace(
          "/upload/",
          "/upload/fl_attachment/"
        );
        const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(
          res.data.secure_url
        )}&embedded=true`;

        console.log(viewerUrl);
        console.log("PDF URL:", url);
        return url;
      }

      console.log("res.data:", res.data);

      return res.data.secure_url;
    } catch (error) {
      console.error("Detailed Cloudinary upload error:", error);
      if (error.response) {
        console.error("Error response:", error.response.data);
        console.error("Error status:", error.response.status);
        console.error("Error headers:", error.response.headers);
      }
      toast.error("File upload failed. Please try again.");
      setProgress(0);
      return null;
    }
  };

  const validateAndUploadFile = async (inputRef, fileType = "image") => {
    const input = inputRef.current;

    if (!input || !input.files) {
      console.error("File input reference is not available.");
      return null;
    }

    const file = input.files[0];
    if (!file) {
      console.error("No file selected");
      return null;
    }

    // Validation options for different file types
    const validationOptions = {
      video: {
        maxSize: 4 * 1024 * 1024, // 4GB
        allowedTypes: ["video/mp4", "video/mpeg", "video/quicktime"],
        maxSizeLabel: "400 MB",
      },
      image: {
        maxSize: 10 * 1024 * 1024, // 10MB
        allowedTypes: ["image/jpeg", "image/png", "image/gif"],
        maxSizeLabel: "10 MB",
      },
      file: {
        maxSize: 10 * 1024 * 1024, // 10MB
        allowedTypes: ["application/pdf"],
        maxSizeLabel: "10 MB",
      },
    };

    const options = validationOptions[fileType];
    const { maxSize, allowedTypes, maxSizeLabel } = options;

    // File size check
    if (file.size > maxSize) {
      toast.error(`File size should be less than ${maxSizeLabel}`);
      input.value = null; // Reset file input
      return null;
    }

    // File type check
    if (!allowedTypes.includes(file.type)) {
      toast.error(
        `Invalid file type. Allowed types: ${allowedTypes.join(", ")}`
      );
      input.value = null; // Reset file input
      return null;
    }

    // Upload file
    const fileUrl = await handleFileUploadToCloudinary(file, fileType);

    // Reset input after upload
    input.value = null;

    return fileUrl;
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create preview URL for images
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }

    try {
      // Determine file type
      let fileType = "file";
      if (file.type.startsWith("image/")) {
        fileType = "image";
      } else if (file.type.startsWith("video/")) {
        fileType = "video";
      }

      // Upload file to Cloudinary
      const fileUrl = await validateAndUploadFile(fileInputRef, fileType);
      if (fileUrl) {
        setSelectedFile(fileUrl);
      }
    } catch (error) {
      console.error("Error handling file:", error);
      toast.error("Failed to process file");
      clearSelectedFile();
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setPreviewUrl("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const initiateCall = async () => {
    if (!tutor._id || connectionRef.current) return; // Prevent multiple connections

    setIsCalling(true);
    setoutgoingCallInfo({
      callerData: {
        avatar: userType === "user" ? selectedChat?.tutorId?.profileImg : selectedChat?.userId?.profileImg,
        name: userType === "user" ? selectedChat?.tutorId?.fullName : selectedChat?.userId?.fullName,
      },
    });

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      setStream(mediaStream);

      if (myVideoRef.current) {
        myVideoRef.current.srcObject = mediaStream;
      }

      createInitiatorPeer(mediaStream);
    } catch (error) {
      console.error("Error accessing media devices:", error);
      setIsCalling(false);
    }
};

const createInitiatorPeer = (mediaStream) => {
    if (!mediaStream?.getTracks().length || connectionRef.current) {
        console.error("No media tracks available or connection exists");
        return;
    }

    const peer = new SimplePeer({
        initiator: true,
        trickle: false,
        stream: mediaStream,
        config: {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:global.stun.twilio.com:3478" },
            ],
        },
    });

    // Set up signal handler before emitting any signals
    let signalAttempts = 0;
    peer.on("signal",  (signalData) => {
        if (signalData.type === "offer" && signalAttempts === 0) {
            signalAttempts++;
            try {
                 socketService.initializeCall({
                    recieverId: receiverId,
                    signalData,
                    from: socketService.socket.id,
                    callerName: tutor.fullName,
                    callerAvatar: tutor.profileImg,
                    callerUserId: tutor._id,
                });
            } catch (error) {
                console.error("Failed to initialize call:", error);
                handleEndCall();
            }
        }
    });

    connectionRef.current = peer;
    setupPeerEventListeners(peer);
};

const answerCall = async () => {
    if (!incomingCallInfo?.signalData || connectionRef.current) return;

    try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
        });

        setStream(mediaStream);
        setIncomingCallInfo((prev)=>({...prev,isSomeoneCalling:false}))

        if (myVideoRef.current) {
            myVideoRef.current.srcObject = mediaStream;
        }

        createAnswerPeer(mediaStream);
    } catch (error) {
        console.error("Error accessing media devices:", error);
        handleEndCall();
    }
};

const createAnswerPeer = (mediaStream) => {
    if (!mediaStream?.getTracks().length || connectionRef.current) {
        console.error("Invalid media stream or connection exists");
        return;
    }

    const peer = new SimplePeer({
        initiator: false,
        trickle: false,
        stream: mediaStream,
        config: {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:global.stun.twilio.com:3478" },
            ],
        },
    });

    // Set up signal handler before processing the offer
    let answerSent = false;
    peer.on("signal",  (signalData) => {
        if (signalData.type === "answer" && !answerSent) {
            answerSent = true;
            try {
                 socketService.answerCall({
                    signalData,
                    to: incomingCallInfo.from,
                });
            } catch (error) {
                console.error("Failed to send answer:", error);
                handleEndCall();
            }
        }
    });

    connectionRef.current = peer;
    setupPeerEventListeners(peer);

    // Process the offer
    try {
        peer.signal(incomingCallInfo.signalData);
    } catch (error) {
        console.error("Error processing offer:", error);
        handleEndCall();
    }
};

// Common event listeners for both initiator and answerer
const setupPeerEventListeners = (peer) => {
    peer.on("stream", (remoteStream) => {
        if (peerVideoRef.current) {
            peerVideoRef.current.srcObject = remoteStream;
        }
    });

    peer.on("connect", () => {
        console.log("Peer connection established");
        setIsCalling(false);
        setIsCallActive(true);
        setIsCallAccepted(true);
    });

    peer.on("error", (err) => {
        console.error("Peer error:", err);
        handleEndCall();
    });

    peer.on("close", () => {
        console.log("Peer connection closed");
        handleEndCall();
    });
};

  const handleEndCall = (sendSocketEvent = true) => {
    // Clean up peer connection
    if (connectionRef.current) {
      connectionRef.current.destroy();
      connectionRef.current = null;
    }

    // Clean up video elements
    if (myVideoRef.current) {
      myVideoRef.current.srcObject = null;
    }
    if (peerVideoRef.current) {
      peerVideoRef.current.srcObject = null;
    }

    // Stop all tracks in the stream
    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
        stream.removeTrack(track);
      });
    }

    setStream(null);
    setIsCallActive(false);
    setIsCallAccepted(false);
    setIncomingCallInfo(null);
    setIsCalling(false);

    // Only send socket event if explicitly requested
    if (sendSocketEvent && receiverId) {
      socketService.endCall({ receiverId });
    }
  };

  const handleRejectCall = () => {
    socketService.rejectCall({ to: incomingCallInfo.from });
    setIncomingCallInfo({});
  };

  const onToggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
      }
    }
  };

  const onToggleAudio = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
      }
    }
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex">
      <Sidebar activeSection="Messages" />

      <div className="flex-1">
        {/* Header */}
        <TutorHeader heading="Messages" />

        {/* Chat Container */}
        <div className="flex h-[calc(100vh-90px)] bg-white">
          {/* Chat List */}
          <div
            className={`${
              selectedChat ? "hidden" : "w-full"
            } md:block md:w-80 border-r flex flex-col`}
          >
            <div className="p-3 lg:p-4 border-b">
              <div className="flex items-center justify-between mb-3">
                <h1 className="text-lg font-semibold">Chat</h1>
                <Button
                  className="bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm"
                  size="sm"
                  onClick={() => setComposeOpen(true)}
                >
                  + Compose
                </Button>
              </div>
              <div className="relative">
                <Input
                  className="pl-8 bg-gray-50 text-sm"
                  placeholder="Search"
                  type="search"
                />
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="divide-y">
                {chats
                  .filter((chat) => {
                    return (
                      chat &&
                      chat._id &&
                      ((userType === "user" && chat.tutorId) ||
                        (userType === "tutor" && chat.userId))
                    );
                  })
                  .map((chat) => {
                    const otherUser =
                      userType === "user" ? chat.tutorId : chat.userId;

                    // Additional validation to ensure otherUser exists
                    if (!otherUser) {
                      return null;
                    }

                    return (
                      <div
                        key={chat._id}
                        className={`p-4 hover:bg-gray-50 cursor-pointer ${
                          selectedChat?._id === chat._id ? "bg-orange-50" : ""
                        }`}
                        onClick={() => handleChatSelect(chat)}
                      >
                        <div className="flex gap-3">
                          <div className="relative">
                            <Avatar className="h-12 w-12">
                              {otherUser?.profileImg ? (
                                <AvatarImage
                                  referrerPolicy="no-referrer"
                                  crossOrigin="anonymous"
                                  src={otherUser?.profileImg}
                                  alt={`${
                                    otherUser?.fullName || "User"
                                  }'s avatar`}
                                  onError={(e) => {
                                    e.target.src = "/placeholder.svg"; // Fallback image
                                  }}
                                />
                              ) : (
                                <AvatarFallback>
                                  {(otherUser?.fullName || "?").charAt(0)}
                                </AvatarFallback>
                              )}
                            </Avatar>
                            <span
                              className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${
                                chat.isOnline?.[
                                  userType === "user" ? "tutor" : "student"
                                ]
                                  ? "bg-green-500"
                                  : "bg-gray-300"
                              }`}
                            />
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <div className="flex items-center justify-between">
                              <h3 className="font-semibold truncate">
                                {otherUser?.fullName || "Unknown User"}
                              </h3>
                              <span className="text-xs text-gray-500">
                                {chat.lastMessage?.timestamp &&
                                  formatTime(chat.lastMessage.timestamp)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-gray-600 truncate">
                                {chat.lastMessage?.contentType === "media"
                                  ? `Media 📷`
                                  : chat.lastMessage?.content ||
                                    "Start a conversation"}
                              </p>
                              {chat.unreadCount?.[
                                userType === "user" ? "student" : "tutor"
                              ] > 0 && (
                                <p className="text-xs bg-orange-400 px-[9px] py-[3px] rounded-full text-white">
                                  {
                                    chat.unreadCount[
                                      userType === "user" ? "student" : "tutor"
                                    ]
                                  }
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>
          </div>

          {/* Chat Area */}
          <div
            className={`${
              !selectedChat ? "hidden" : "flex flex-col w-full"
            } md:flex md:flex-1`}
          >
            {selectedChat ? (
              <>
                <div className="flex items-center justify-between p-3 border-b">
                  <div className="flex items-center gap-2">
                    <button
                      className="md:hidden"
                      onClick={() => setSelectedChat(null)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 19l-7-7 7-7"
                        />
                      </svg>
                    </button>
                    <div className="relative">
                      <Avatar className="h-8 w-8">
                        <img
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"
                          src={
                            userType === "user"
                              ? selectedChat.tutorId?.profileImg
                              : selectedChat.userId?.profileImg
                          }
                          alt="Chat partner's avatar"
                        />
                        <AvatarFallback>
                          {userType === "user"
                            ? selectedChat.tutorId?.fullName?.charAt(0)
                            : selectedChat.userId?.fullName?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div>
                      <h2 className="font-semibold text-sm">
                        {userType === "user"
                          ? selectedChat.tutorId?.fullName
                          : selectedChat.userId?.fullName}
                      </h2>
                      <p
                        className={`text-xs ${
                          selectedChat.isOnline[
                            userType === "user" ? "tutor" : "student"
                          ]
                            ? "text-green-600"
                            : "text-gray-500"
                        }`}
                      >
                        {selectedChat.isOnline[
                          userType === "user" ? "tutor" : "student"
                        ]
                          ? "Online"
                          : "Offline"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Video className="cursor-pointer" onClick={initiateCall} />
                    <div className="relative">
                      <Button
                        onClick={() => handleOptionsModalOpen()}
                        variant="ghost"
                        size="icon"
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </Button>
                      {optionsModalOpen && (
                        <div className="absolute right-4 mt-2 w-48 bg-white rounded-lg shadow-lg py-1 z-50 border border-gray-200">
                          <button className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 w-full transition-colors">
                            <AlertTriangle className="w-4 h-4 mr-2 text-orange-500" />
                            Block Tutor
                          </button>
                          <button
                            onClick={handleDeleteChat}
                            className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 w-full transition-colors"
                          >
                            <Trash2Icon className="w-4 h-4 mr-2 text-orange-500" />
                            Delete chat
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <ScrollArea className="flex-1 p-3">
                  <div className="space-y-3">
                    {messages.map((message) => (
                      <div
                        key={message._id}
                        className={`flex gap-2 max-w-[85%] ${
                          message.sender.userId === tutor._id
                            ? "justify-end ml-auto"
                            : ""
                        }`}
                      >
                        {message.sender.userId !== tutor._id && (
                          <Avatar className="h-6 w-6 mt-1">
                          <img
                            crossOrigin="anonymous"
                            referrerPolicy="no-referrer"
                            src={
                              userType === "user"
                                ? selectedChat.tutorId?.profileImg
                                : selectedChat.userId?.profileImg
                            }
                            alt="Sender's avatar"
                          />
                          <AvatarFallback>
                            {userType === "tutor"
                              ? selectedChat.tutorId?.fullName?.charAt(0)
                              : selectedChat.userId?.fullName?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        )}
                        <div>
                          <div
                            className={`rounded-2xl p-2 text-sm ${
                              message.sender.userId === tutor._id
                                ? "bg-[#ff6738] text-white"
                                : "bg-[#ffeee8]"
                            }`}
                          >
                            {renderMessageContent(message)}
                          </div>
                          <div className="flex mt-1">
                            {message.sender.userId === tutor._id && (
                              <MessageStatus status={message.status} />
                            )}
                            <span className="text-xs text-gray-500 ml-2">
                              {formatTime(
                                message.createdAt || message.timestamps
                              )}
                            </span>
                          </div>
                        </div>
                        {message.sender.userId === tutor._id && (
                          <Avatar className="h-6 w-6 mt-1">
                            <AvatarImage
                              src={tutor?.profileImg}
                              alt="Your avatar"
                            />
                            <AvatarFallback>
                              {tutor?.fullName.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    ))}
                    {isTyping && <TypingIndicator />}

                    <div ref={messagesEndRef}></div>
                  </div>
                </ScrollArea>

                <div className="p-3 border-t">
                  {selectedFile && (
                    <div className="mb-2 relative inline-block">
                      {previewUrl && (
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="h-20 w-20 object-cover rounded-lg"
                        />
                      )}
                      <button
                        onClick={clearSelectedFile}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept="image/jpeg,image/png,image/gif,video/mp4"
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon className="h-5 w-5 text-gray-500" />
                    </Button>
                    <Input
                      className="flex-1 text-sm"
                      placeholder="Type your message"
                      value={inputMessage}
                      onChange={(e) => {
                        setInputMessage(e.target.value);
                        handleTyping();
                      }}
                      disabled={!!selectedFile}
                    />
                    <Button
                      type="submit"
                      className="bg-[#ff4f38] hover:bg-[#e63f2a]"
                    >
                      <span className="hidden sm:inline">Send</span>
                      <Send className="h-4 w-4 sm:ml-2" />
                    </Button>
                  </form>
                </div>
              </>
            ) : (
              <div className="hidden md:flex flex-1 items-center justify-center text-gray-500 text-sm">
                Select a chat to start messaging
              </div>
            )}
          </div>
        </div>

        <ComposeModalUser
          open={composeOpen}
          onOpenChange={setComposeOpen}
          onChatCreated={handleCreateChat}
          recipients={students}
          tutor={tutor}
        />

        <VideoCallInterface
          stream={stream}
          myVideoRef={myVideoRef}
          peerVideoRef={peerVideoRef}
          isCallAccepted={isCallAccepted}
          incomingCallInfo={incomingCallInfo}
          outgoingCallInfo={outgoingCallInfo}
          isCalling={isCalling}
          onAnswer={answerCall}
          onReject={handleRejectCall}
          onEndCall={handleEndCall}
          isCallActive={isCallActive || isCallAccepted}
          onToggleAudio={onToggleAudio}
          onToggleVideo={onToggleVideo}
          isAudioEnabled={isAudioEnabled}
          isVideoEnabled={isVideoEnabled}
        />
      </div>
    </div>
  );
}
