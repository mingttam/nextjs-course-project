"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useChatWebSocket } from "@/hooks/useChatWebSocket";
import { useChatInfiniteScroll } from "@/hooks/useChatInfiniteScroll";
import { useInfiniteScroll } from "@/hooks/student/useInfiniteScroll";
import { useEmojiUtils } from "@/hooks/student/useEmojiUtils";
import { useFileUpload } from "@/hooks/student/useFileUpload";
import {
  useSendMessageMutation,
  useUpdateMessageMutation,
  useDeleteMessageMutation,
} from "@/services/websocket/chatApi";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { cn } from "@/lib/utils";
import { ChatMessage } from "@/types/chat";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

// Import new components
import { ChatHeader } from "./ChatHeader";
import { ChatMessageItem } from "./ChatMessageItem";
import { ChatInput } from "./ChatInput";

interface ChatProps {
  courseId: string;
  courseTitle?: string;
  onClose: () => void;
  isMobile?: boolean;
}

const Chat: React.FC<ChatProps> = ({
  courseId,
  courseTitle,
  onClose,
  isMobile = false,
}) => {
  const [messageText, setMessageText] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [deletingMessages, setDeletingMessages] = useState<Set<string>>(
    new Set()
  );
  const [updatingMessages, setUpdatingMessages] = useState<Set<string>>(
    new Set()
  );
  const [deletedMessages, setDeletedMessages] = useState<Set<string>>(
    new Set()
  );
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollAreaViewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerWrapperRef = useRef<HTMLDivElement>(null);

  const { data: session } = useSession();

  // Custom hooks
  const {
    EMOJI_MAP,
    convertEmojiToText,
    convertShortcodesToEmoji,
    insertEmojiIntoMessage,
  } = useEmojiUtils();

  if (!session?.user?.accessToken || !courseId) {
    return null;
  }

  const currentUserId = session.user.id;

  const {
    messages: loadedMessages,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
    fetchNextPage,
    resetMessages,
    addNewMessage,
    updateMessage: updateInfiniteScrollMessage,
    removeMessage,
    isInitialized,
    infiniteScrollDisabled,
  } = useChatInfiniteScroll({
    courseId,
    pageSize: 20,
    enabled: true,
  });

  const { setAutoScrolling } = useInfiniteScroll(scrollAreaRef, {
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    threshold: 100,
    disabled: infiniteScrollDisabled,
  });

  const {
    messages: wsMessages,
    isConnected,
    connectionState,
    error: wsError,
    removeMessage: removeWSMessage,
  } = useChatWebSocket({
    accessToken: session.user.accessToken,
    courseId,
    userId: currentUserId,
    autoConnect: true,
    onReconnect: () => {
      setPendingMessages((prev) => prev.filter((p) => p.status !== "SUCCESS"));
    },
  });

  const [sendMessage] = useSendMessageMutation();
  const [updateMessage] = useUpdateMessageMutation();
  const [deleteMessage] = useDeleteMessageMutation();

  const { handleFileUpload } = useFileUpload({
    courseId,
    sendMessage,
    setPendingMessages,
  });

  const allMessages = useMemo(() => {
    const combinedMessages = [...loadedMessages];
    if (wsMessages && wsMessages.length > 0) {
      const loadedMessageIds = new Set(loadedMessages.map((m) => m.id));
      wsMessages.forEach((wsMsg) => {
        if (wsMsg.id && !loadedMessageIds.has(wsMsg.id)) {
          combinedMessages.unshift(wsMsg);
        }
      });
    }

    // Filter pending messages - remove if real message with similar content exists
    const pendingWithoutDuplicates = pendingMessages.filter((pending) => {
      // Only check SUCCESS pending messages for duplicates
      if (pending.status === "SUCCESS") {
        // Check if a real message exists with:
        // 1. Same ID (exact match)
        // 2. Same content + same sender (fuzzy match for WebSocket messages)
        const hasRealMessage = combinedMessages.some((msg) => {
          // Exact ID match
          if (msg.id === pending.id) return true;

          // Fuzzy match: same content, same sender, created within 10 seconds
          if (
            msg.content === pending.content &&
            msg.senderId === pending.senderId &&
            msg.type === pending.type
          ) {
            const msgTime = new Date(msg.createdAt).getTime();
            const pendingTime = new Date(pending.createdAt).getTime();
            const timeDiff = Math.abs(msgTime - pendingTime);
            // Allow 10 seconds difference to account for clock skew
            return timeDiff < 10000;
          }

          return false;
        });
        return !hasRealMessage;
      }
      // Keep PENDING/ERROR messages
      return true;
    });

    // Filter out locally deleted messages
    const allCombined = [
      ...combinedMessages,
      ...pendingWithoutDuplicates,
    ].filter((msg) => !deletedMessages.has(msg.id));

    return allCombined.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [loadedMessages, wsMessages, pendingMessages, deletedMessages]);

  // Effects
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [messageText]);

  useEffect(() => {
    if (wsMessages && wsMessages.length > 0) {
      const latestWsMessage = wsMessages[wsMessages.length - 1];
      if (latestWsMessage?.id) {
        addNewMessage(latestWsMessage);
        setShouldScrollToBottom(true);
      }
    }
  }, [wsMessages, addNewMessage]);

  useEffect(() => {
    resetMessages();
    setIsInitializing(true);

    // Clear deleted messages when switching courses
    setDeletedMessages(new Set());

    const timer = setTimeout(() => setIsInitializing(false), 300);
    return () => clearTimeout(timer);
  }, [courseId, resetMessages]);

  useEffect(() => {
    if (isInitialized || !isLoading) {
      setIsInitializing(false);
    }
  }, [isInitialized, isLoading]);

  useEffect(() => {
    if (allMessages.length > 0 && shouldScrollToBottom) {
      setAutoScrolling(true);
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
          setShouldScrollToBottom(false);
        }
      }, 300);
    }
  }, [allMessages.length, shouldScrollToBottom, setAutoScrolling]);

  useEffect(() => {
    if (isInitialized && allMessages.length > 0 && !shouldScrollToBottom) {
      const isFirstLoad = allMessages.length <= 20;
      if (isFirstLoad) {
        setAutoScrolling(true);
        setTimeout(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({
              behavior: "instant" as any,
            });
          }
        }, 200);
      }
    }
  }, [
    isInitialized,
    allMessages.length,
    shouldScrollToBottom,
    setAutoScrolling,
  ]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    if (!showEmojiPicker) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (
        emojiPickerWrapperRef.current &&
        target &&
        !emojiPickerWrapperRef.current.contains(target)
      ) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showEmojiPicker]);

  // Event handlers
  const handleSendMessage = async () => {
    if (!messageText.trim()) return;

    const contentToSend = convertEmojiToText(messageText.trim());
    const tempId = uuidv4();
    const tempTimestamp = new Date().toISOString();

    // Optimistic update: Add message to UI immediately
    const optimisticMessage: ChatMessage = {
      id: tempId,
      tempId: tempId,
      courseId: courseId,
      content: contentToSend,
      type: "TEXT",
      senderId: currentUserId,
      senderName: session.user.name || "You",
      senderThumbnailUrl: session.user.thumbnailUrl || undefined,
      senderRole: "STUDENT", // Default to STUDENT for optimistic update
      createdAt: tempTimestamp,
      status: "PENDING",
    };

    setPendingMessages((prev) => [...prev, optimisticMessage]);
    setShouldScrollToBottom(true);
    setMessageText("");
    setShowEmojiPicker(false);

    try {
      const response = await sendMessage({
        courseId,
        content: contentToSend,
        type: "TEXT",
        tempId: tempId,
      }).unwrap();

      // Update pending message with real ID from server
      // This allows the duplicate filter to match it with incoming WebSocket message
      setPendingMessages((prev) =>
        prev.map((msg) =>
          msg.tempId === tempId
            ? {
                ...msg,
                id: response.data.id, // Update with real ID from server
                tempId: tempId, // Keep tempId for tracking
                status: "SUCCESS",
              }
            : msg
        )
      );

      // Don't remove immediately - let WebSocket message arrival trigger the cleanup
      // The duplicate filter will automatically remove pending message when WS message arrives

      if (textareaRef.current) {
        setTimeout(() => {
          try {
            textareaRef.current?.focus();
            const len = textareaRef.current?.value?.length || 0;
            textareaRef.current?.setSelectionRange(len, len);
          } catch (e) {
            // ignore if selection APIs are not available
          }
        }, 0);
      }
    } catch (error) {
      // Mark message as error
      setPendingMessages((prev) =>
        prev.map((msg) =>
          msg.tempId === tempId ? { ...msg, status: "ERROR" } : msg
        )
      );
      toast.error("Failed to send message. Please try again.");
    }
  };

  const handleEditMessage = async (messageId: string) => {
    if (!editingText.trim()) return;
    setUpdatingMessages((prev) => new Set(prev).add(messageId));

    try {
      updateInfiniteScrollMessage(messageId, { content: editingText.trim() });
      const result = await updateMessage({
        courseId,
        messageId,
        type: "TEXT",
        content: editingText.trim(),
      }).unwrap();
      setEditingMessageId(null);
      setEditingText("");
      if (result?.data) updateInfiniteScrollMessage(messageId, result.data);
    } catch (error) {
      toast.error("Failed to update message. Please try again.");
    } finally {
      setUpdatingMessages((prev) => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    setDeletingMessages((prev) => new Set(prev).add(messageId));

    try {
      // First make the API call, only remove from UI if it succeeds
      await deleteMessage({ courseId, messageId }).unwrap();

      // API call succeeded, now remove from both UI sources
      removeMessage(messageId); // Remove from infinite scroll messages
      removeWSMessage(messageId); // Remove from WebSocket messages

      // Add to deleted messages set to prevent reappearing
      setDeletedMessages((prev) => new Set(prev).add(messageId));

      // Clean up deleting state
      setDeletingMessages((prev) => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
    } catch (error) {
      toast.error("Failed to delete message. Please try again.");

      // API call failed, keep message in UI and clean up deleting state
      setDeletingMessages((prev) => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const startEditing = (message: ChatMessage) => {
    if (message.type.toUpperCase() !== "TEXT") {
      toast.error("Only text messages can be edited.");
      return;
    }
    setEditingMessageId(message.id);
    setEditingText(message.content || "");
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  const canEditMessage = (message: ChatMessage) => {
    return (
      isCurrentUser(message) &&
      message.type.toUpperCase() === "TEXT" &&
      message.status !== "PENDING" &&
      message.status !== "ERROR" &&
      !updatingMessages.has(message.id) &&
      !deletingMessages.has(message.id)
    );
  };

  const isCurrentUser = (message: ChatMessage) =>
    message.senderId === currentUserId;

  const handleEmojiSelect = (emoji: string) => {
    insertEmojiIntoMessage(emoji, messageText, setMessageText, textareaRef);
  };

  const handleFileUploadWrapper = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    handleFileUpload(event);
  };

  return (
    <Card
      className={cn(
        "flex flex-col shadow-none border-0 gap-0 py-0 rounded-none",
        "w-full h-full max-w-full max-h-full overflow-hidden"
      )}
    >
      <ChatHeader
        courseTitle={courseTitle}
        isConnected={isConnected}
        connectionState={connectionState}
        wsError={wsError}
        isInitializing={isInitializing}
        isMobile={isMobile}
        onClose={onClose}
      />

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden min-h-0">
        <div className="flex-1 overflow-hidden min-h-0">
          <ScrollArea
            className={cn(
              "h-full w-full max-w-full",
              isMobile ? "p-2" : "px-4"
            )}
            ref={scrollAreaRef}
          >
            <div
              className={cn(
                "w-full max-w-full overflow-hidden",
                isMobile ? "space-y-2" : "space-y-4"
              )}
              ref={scrollAreaViewportRef}
            >
              {isFetchingNextPage && (
                <div className="text-center py-2">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Loading older messages...
                  </p>
                </div>
              )}

              {!hasNextPage && allMessages.length > 0 && (
                <div className="text-center py-2">
                  <p className="text-xs text-muted-foreground">
                    No more messages
                  </p>
                </div>
              )}

              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                  <div className="text-base font-medium text-gray-900 mb-2">
                    Loading messages...
                  </div>
                  <div className="text-sm text-gray-500">
                    Please wait while we fetch your chat history
                  </div>
                </div>
              ) : allMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-full flex items-center justify-center mb-4">
                    <Send className="w-8 h-8 text-gray-400" />
                  </div>
                  <div className="text-base font-medium text-gray-900 mb-2">
                    No messages yet
                  </div>
                  <div className="text-sm text-gray-500">
                    Start the conversation! Type a message below.
                  </div>
                </div>
              ) : (
                [...allMessages]
                  .reverse()
                  .map((message) => (
                    <ChatMessageItem
                      key={message.id || (message as ChatMessage).tempId}
                      message={message}
                      isCurrentUser={isCurrentUser(message)}
                      isMobile={isMobile}
                      editingMessageId={editingMessageId}
                      editingText={editingText}
                      setEditingText={setEditingText}
                      onEditMessage={handleEditMessage}
                      onCancelEditing={cancelEditing}
                      onStartEditing={startEditing}
                      onDeleteMessage={handleDeleteMessage}
                      canEditMessage={canEditMessage}
                      convertShortcodesToEmoji={convertShortcodesToEmoji}
                      deletingMessages={deletingMessages}
                      updatingMessages={updatingMessages}
                    />
                  ))
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>

        <ChatInput
          messageText={messageText}
          setMessageText={setMessageText}
          onSendMessage={handleSendMessage}
          onFileUpload={handleFileUploadWrapper}
          onKeyPress={handleKeyPress}
          isConnected={isConnected}
          isMobile={isMobile}
          showEmojiPicker={showEmojiPicker}
          setShowEmojiPicker={setShowEmojiPicker}
          onEmojiSelect={handleEmojiSelect}
          emojiMap={EMOJI_MAP}
          emojiPickerWrapperRef={emojiPickerWrapperRef}
          textareaRef={textareaRef}
        />
      </CardContent>
    </Card>
  );
};

export default Chat;
