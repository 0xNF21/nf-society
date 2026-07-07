import ArcadeNightPage from "@/components/arcade-night-page";
import { getArcadeNightPublicState } from "@/lib/arcade-night";

export const dynamic = "force-dynamic";

export default async function Page() {
  const state = await getArcadeNightPublicState();
  return <ArcadeNightPage state={state} />;
}
