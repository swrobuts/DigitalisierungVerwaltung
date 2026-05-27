/**
 * FbIcon — mappt einen lucide-Namen (aus ALL_FOERDERBEREICHE[fb].icon) auf
 * eine Lucide-React-Icon-Komponente. Ersetzt die alten Emojis.
 *
 * Falls der Name nicht gemappt ist, rendern wir nichts (kein Fallback-Text
 * — das Label nebenan reicht aus).
 */
import { Sprout, HeartHandshake, Landmark, Target } from "lucide-react";

const MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  sprout: Sprout,
  "heart-handshake": HeartHandshake,
  landmark: Landmark,
  target: Target,
};

export function FbIcon({
  name,
  className = "h-3.5 w-3.5",
}: {
  name: string;
  className?: string;
}) {
  const Icon = MAP[name];
  if (!Icon) return null;
  return <Icon className={className} aria-hidden="true" />;
}
