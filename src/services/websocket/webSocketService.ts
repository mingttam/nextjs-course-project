import { ChatMessage, WebSocketConfig } from "@/types/chat";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { toast } from "sonner";

export class WebSocketService {
  private client: Client | null = null;
  private config: WebSocketConfig | null = null;
  private isConnected = false;
  private subscription: any = null;
  private currentUserId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor() {
    this.client = null;
  }

  /**
   * Connect to WebSocket server
   */
  connect(config: WebSocketConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.config = config;
        this.currentUserId = config.userId || null;

        // Create SockJS socket
        const socket = new SockJS(`${config.baseUrl}/ws-chat`);

        // Create STOMP client
        this.client = new Client({
          webSocketFactory: () => socket,
          connectHeaders: {
            Authorization: `Bearer ${config.token}`,
          },
          reconnectDelay: 5000,
          heartbeatIncoming: 4000,
          heartbeatOutgoing: 4000,
          onConnect: (frame) => {
            this.isConnected = true;
            this.reconnectAttempts = 0;

            // Subscribe to course messages
            this.subscribeToMessages(config.courseId);

            config.onConnect?.();
            resolve();
          },
          onStompError: (frame) => {
            toast.error("WebSocket connection error. Please try again.");
            this.isConnected = false;
            config.onError?.(frame);
            reject(
              new Error(
                frame.headers["message"] || "WebSocket connection failed"
              )
            );
          },
          onDisconnect: () => {
            this.isConnected = false;
            this.subscription = null;
            config.onDisconnect?.();

            // Auto-reconnect logic
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
              this.reconnectAttempts++;

              setTimeout(() => {
                if (this.config) {
                  this.connect(this.config)
                    .then(() => {
                      this.config?.onReconnect?.();
                    })
                    .catch((error) => {
                      toast.error("Reconnection failed. Please try again.");
                    });
                }
              }, 5000 * this.reconnectAttempts);
            }
          },
          onWebSocketError: (error) => {
            toast.error("WebSocket error. Please try again.");
            config.onError?.(error);
          },
        });

        // Activate the client
        this.client.activate();
      } catch (error) {
        toast.error("Error connecting to WebSocket. Please try again.");
        reject(error);
      }
    });
  }

  /**
   * Subscribe to course messages
   */
  private async subscribeToMessages(courseId: string) {
    if (!this.client) {
      toast.error("WebSocket client not initialized");
      return;
    }

    // Wait for the underlying STOMP connection to be ready
    const waitForStompConnected = async (timeoutMs = 5000) => {
      const intervalMs = 100;
      const start = Date.now();
      // eslint-disable-next-line no-async-promise-executor
      return new Promise<boolean>(async (resolve) => {
        const check = () => {
          if (this.client && (this.client as any).connected === true) {
            resolve(true);
            return;
          }

          if (Date.now() - start > timeoutMs) {
            resolve(false);
            return;
          }

          setTimeout(check, intervalMs);
        };

        check();
      });
    };

    const connected = await waitForStompConnected(5000);
    if (!connected) {
      toast.error("STOMP client not connected after wait - cannot subscribe");
      return;
    }

    try {
      const destination = `/topic/courses/${courseId}/messages`;

      this.subscription = this.client.subscribe(destination, (message) => {
        try {
          const chatMessage: ChatMessage = JSON.parse(message.body);
          // Validate that required fields are present
          if (!chatMessage.content && chatMessage.type === "TEXT") {
            toast.warning("Received message with missing content");
          }

          this.config?.onMessage(chatMessage);
        } catch (error) {
          toast.error("Error parsing message. Please try again.");
        }
      });

      return this.subscription;
    } catch (error) {
      toast.error("Error subscribing to messages. Please try again.");
      throw error;
    }
  }

  /**
   * Unsubscribe from current subscription
   */
  unsubscribe() {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  /**
   * Subscribe to a different course
   */
  subscribeToCourse(courseId: string) {
    this.unsubscribe();
    this.subscribeToMessages(courseId);
    if (this.config) {
      this.config.courseId = courseId;
    }
  }

  /**
   * Send a message via WebSocket (for future real-time features)
   */
  sendMessage(destination: string, body: any, headers: any = {}) {
    if (!this.client || !this.isConnected) {
      toast.error("WebSocket client not connected");
      return;
    }

    this.client.publish({
      destination,
      body: JSON.stringify(body),
      headers,
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.client && this.isConnected) {
        // Unsubscribe from both topics
        this.unsubscribe();

        this.client.onDisconnect = () => {
          this.isConnected = false;
          this.client = null;
          this.config = null;
          this.currentUserId = null;
          this.reconnectAttempts = 0;
          resolve();
        };
        this.client.deactivate();
      } else {
        resolve();
      }
    });
  }

  /**
   * Force reconnect
   */
  async reconnect() {
    if (this.config) {
      await this.disconnect();
      await this.connect(this.config);
    }
  }

  /**
   * Check if connected
   */
  isWebSocketConnected(): boolean {
    return this.isConnected && this.client?.connected === true;
  }

  /**
   * Get connection state
   */
  getConnectionState(): string {
    if (!this.client) return "DISCONNECTED";
    return this.client.state.toString();
  }

  /**
   * Get subscription status
   */
  getSubscriptionStatus(): { isSubscribed: boolean; destination?: string } {
    if (!this.subscription) {
      return { isSubscribed: false };
    }

    return {
      isSubscribed: true,
      destination: this.subscription.destination || "unknown",
    };
  }

  /**
   * Test subscription by sending a ping
   */
  testSubscription() {
    if (!this.client || !this.isConnected) {
      toast.error("Cannot test subscription: WebSocket not connected");
      return false;
    }

    if (!this.subscription) {
      toast.error("Cannot test subscription: No active subscription");
      return false;
    }

    return true;
  }
}

// Singleton instance
export const webSocketService = new WebSocketService();
