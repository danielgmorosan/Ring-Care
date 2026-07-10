/**
 * MQTT topic contracts shared between the guardian device app and the backend.
 *
 * The device link is MQTT over TLS 1.3 with per-device certificates (CLAUDE.md).
 * Topics are namespaced per device so broker ACLs can restrict each device's
 * certificate to only its own subtree — one compromised phone can never publish
 * to or read another device's topics (blast-radius containment).
 */

export const MQTT_TOPIC_ROOT = 'obrigada' as const;

/** Direction is always from the device's point of view. */
export const mqttTopics = {
  /** Device → backend: derived event stream (QoS 1 for alerts). */
  events: (deviceId: string): string => `${MQTT_TOPIC_ROOT}/dev/${deviceId}/events`,
  /** Device → backend: periodic liveness heartbeat. */
  heartbeat: (deviceId: string): string => `${MQTT_TOPIC_ROOT}/dev/${deviceId}/heartbeat`,
  /** Backend → device: commands (e.g. remote wipe, OTA trigger, config). */
  commands: (deviceId: string): string => `${MQTT_TOPIC_ROOT}/dev/${deviceId}/cmd`,
  /** Backend → device: acknowledgements for at-least-once event delivery. */
  ack: (deviceId: string): string => `${MQTT_TOPIC_ROOT}/dev/${deviceId}/ack`,
} as const;

/** ACL pattern (per-device certificate CN → allowed topic subtree). */
export const deviceTopicPattern = (deviceId: string): string =>
  `${MQTT_TOPIC_ROOT}/dev/${deviceId}/#`;
