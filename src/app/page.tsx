import { isRealStakesEnabled } from "@/lib/stakes";
import LandingCrc from "@/components/landing-crc";
import LandingXp from "@/components/landing-xp";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const crcEnabled = await isRealStakesEnabled();
  return crcEnabled ? <LandingCrc /> : <LandingXp />;
}
