import { Redirect } from "expo-router";
import { useAppStore } from "../state/appStore";

export default function Splash() {
  const session = useAppStore((s) => s.session);
  return <Redirect href={session ? "/fixtures" : "/login"} />;
}
