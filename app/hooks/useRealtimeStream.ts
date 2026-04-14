/**
 * useRealtimeStream — Phase 4 Frontend SSE Hook (G-024)
 *
 * Custom React hook for connecting to /api/admin/stream
 * Features:
 *   - Auto-reconnect with exponential backoff (1s → 2s → 4s → 8s → 30s max)
 *   - Event filtering by type
 *   - Max 100 events in memory (FIFO)
 *   - Connection state tracking
 *   - Cleanup on unmount
 *
 * Usage:
 *   const { events, isConnected, lastEvent, reconnectCount } = useRealtimeStream(['agent.health']);
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export interface RealtimeEvent {
  id: string;
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

export interface UseRealtimeStreamOptions {
  types?: string[];
  maxEvents?: number;
  autoConnect?: boolean;
}

export interface UseRealtimeStreamResult {
  events: RealtimeEvent[];
  isConnected: boolean;
  lastEvent: RealtimeEvent | null;
  reconnectCount: number;
  error: Error | null;
  connect: () => void;
  disconnect: () => void;
}

const DEFAULT_MAX_EVENTS = 100;
const BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000]; // ms

export function useRealtimeStream(
  options: UseRealtimeStreamOptions = {},
): UseRealtimeStreamResult {
  const { types, maxEvents = DEFAULT_MAX_EVENTS, autoConnect = true } = options;

  // State
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  // Refs
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectHandleRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isMountedRef = useRef(true);

  // Event filter predicate
  const shouldIncludeEvent = useCallback(
    (eventType: string): boolean => {
      if (!types || types.length === 0) return true;
      return types.includes(eventType);
    },
    [types],
  );

  // Connect to stream
  const connect = useCallback(() => {
    if (eventSourceRef.current) return; // Already connected

    try {
      const eventSource = new EventSource('/api/admin/stream');

      // Generic event handler for all event types
      const handleEvent = (ev: Event) => {
        if (!(ev instanceof MessageEvent)) return;

        try {
          const payload = JSON.parse(ev.data);
          const eventType = (ev as unknown as {type?: string}).type || 'unknown';

          if (!shouldIncludeEvent(eventType)) return;

          const event: RealtimeEvent = {
            id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: eventType,
            timestamp: Date.now(),
            payload,
          };

          if (!isMountedRef.current) return;

          setLastEvent(event);
          setEvents((prev) => {
            const next = [event, ...prev];
            return next.slice(0, maxEvents); // Keep max N events
          });
        } catch (err) {
          console.warn('[useRealtimeStream] Failed to parse event:', err);
        }
      };

      // Subscribe to event types dynamically
      const eventTypes = [
        'agent.health',
        'pipeline.status',
        'approval.pending',
        'notification.new',
        'andon.status',
      ];

      for (const type of eventTypes) {
        eventSource.addEventListener(type, handleEvent);
      }

      // Connection lifecycle
      eventSource.addEventListener('open', () => {
        if (!isMountedRef.current) return;
        setIsConnected(true);
        setError(null);
        reconnectAttemptRef.current = 0;
        setReconnectCount(0);
      });

      eventSource.addEventListener('error', () => {
        if (!isMountedRef.current) return;
        setIsConnected(false);
        eventSource.close();
        eventSourceRef.current = null;

        // Exponential backoff reconnect
        const delay =
          BACKOFF_DELAYS[Math.min(reconnectAttemptRef.current, BACKOFF_DELAYS.length - 1)];
        reconnectAttemptRef.current += 1;

        if (!isMountedRef.current) return;
        setReconnectCount(reconnectAttemptRef.current);

        reconnectHandleRef.current = setTimeout(connect, delay);
      });

      eventSourceRef.current = eventSource;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
      if (isMountedRef.current) {
        setError(error);
        setIsConnected(false);
      }

      // Retry after delay
      const delay =
        BACKOFF_DELAYS[Math.min(reconnectAttemptRef.current, BACKOFF_DELAYS.length - 1)];
      reconnectAttemptRef.current += 1;

      if (!isMountedRef.current) return;
      setReconnectCount(reconnectAttemptRef.current);

      reconnectHandleRef.current = setTimeout(connect, delay);
    }
  }, [shouldIncludeEvent, maxEvents]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectHandleRef.current) {
      clearTimeout(reconnectHandleRef.current);
      reconnectHandleRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    isMountedRef.current = true;
    if (autoConnect) {
      connect();
    }

    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    events,
    isConnected,
    lastEvent,
    reconnectCount,
    error,
    connect,
    disconnect,
  };
}
