// Shared UI components. Every screen uses only these, which keeps the look consistent.
// Every pressable is >= 48 dp tall and has an accessibility label; every status is icon + text.
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { AppError, messageForError } from "../core/errors";
import { formatClock } from "../core/format";
import { useAppStore } from "../state/appStore";
import { baseColors, font, radius, space, TAP, useColors } from "./theme";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export function Icon({ name, size = 20, color, label }: { name: string; size?: number; color?: string; label?: string }) {
  return (
    <MaterialCommunityIcons
      name={name as IconName}
      size={size}
      color={color ?? baseColors.onSurface}
      accessibilityLabel={label}
      accessible={!!label}
    />
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  disabled,
  loading,
  accessibilityHint,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: string;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  style?: ViewStyle;
}) {
  const c = useColors();
  const bg = variant === "primary" ? c.primary : variant === "danger" ? c.danger : "transparent";
  const fg = variant === "primary" ? c.onPrimary : variant === "danger" ? "#FFFFFF" : c.primary;
  const border = variant === "secondary" ? c.primary : "transparent";
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border, opacity: off ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  onPress,
  icon,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  icon?: string;
  accessibilityLabel?: string;
}) {
  const content = (
    <>
      {icon ? <Icon name={icon} size={24} color={baseColors.muted} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
      {onPress ? <Icon name="chevron-right" color={baseColors.muted} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${title}${subtitle ? ", " + subtitle : ""}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: baseColors.neutralBg }]}
    >
      {content}
    </Pressable>
  );
}

export type ChipTone = "success" | "warning" | "danger" | "info" | "neutral";

export function StatusChip({ text, icon, tone = "neutral" }: { text: string; icon: string; tone?: ChipTone }) {
  const map = {
    success: [baseColors.successBg, baseColors.success],
    warning: [baseColors.warningBg, baseColors.warning],
    danger: [baseColors.dangerBg, baseColors.danger],
    info: [baseColors.infoBg, baseColors.info],
    neutral: [baseColors.neutralBg, baseColors.onSurface],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.chip, { backgroundColor: bg }]} accessible accessibilityLabel={text}>
      <Icon name={icon} size={16} color={fg} />
      <Text style={[styles.chipText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={styles.section} accessibilityRole="header">
      {title}
    </Text>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function LoadingState({ text }: { text: string }) {
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={baseColors.primary} />
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

export function EmptyState({ text, icon = "information-outline", action }: { text: string; icon?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.center}>
      <Icon name={icon} size={40} color={baseColors.muted} />
      <Text style={styles.emptyText}>{text}</Text>
      {action}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: AppError; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Icon name="alert-circle-outline" size={40} color={baseColors.danger} />
      <Text style={styles.emptyText}>{messageForError(error)}</Text>
      {onRetry ? <Button title="Try again" icon="refresh" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

/** Inline note shown above cached content when the last refresh failed. */
export function StaleNote({ error, lastUpdated }: { error: AppError | null; lastUpdated: number | null }) {
  if (!error) return null;
  const when = lastUpdated ? ` from ${formatClock(lastUpdated)}` : "";
  const text = error.kind === "offline" ? `You're offline. Showing saved data${when}.` : `${messageForError(error)} Showing saved data${when}.`;
  return (
    <View style={styles.stale} accessibilityLiveRegion="polite">
      <Icon name="history" size={16} color={baseColors.warning} />
      <Text style={[styles.small, { color: baseColors.warning, flex: 1 }]}>{text}</Text>
    </View>
  );
}

/** Standard rendering of a cached screen state: loading / empty / error / content. */
export function StateView<T>({
  state,
  loadingText,
  emptyText,
  isEmpty,
  children,
}: {
  state: { data: T | null; isLoading: boolean; error: AppError | null; lastUpdated: number | null; refresh: () => void; isRefreshing: boolean };
  loadingText: string;
  emptyText: string;
  isEmpty?: (d: T) => boolean;
  children: (data: T) => React.ReactNode;
}) {
  if (state.data === null) {
    if (state.isLoading) return <LoadingState text={loadingText} />;
    if (state.error) return <ErrorState error={state.error} onRetry={state.refresh} />;
    return <EmptyState text={emptyText} />;
  }
  if (isEmpty?.(state.data)) {
    return (
      <View style={{ flex: 1 }}>
        <StaleNote error={state.error} lastUpdated={state.lastUpdated} />
        <EmptyState text={emptyText} action={<Button title="Refresh" icon="refresh" variant="secondary" onPress={state.refresh} />} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <StaleNote error={state.error} lastUpdated={state.lastUpdated} />
      {children(state.data)}
    </View>
  );
}

export function Screen({ children, onRefresh, refreshing }: { children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: baseColors.background }}
      contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  error,
  secureTextEntry,
  placeholder,
  keyboardType,
  autoCapitalize = "none",
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  error?: string | null;
  secureTextEntry?: boolean;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "url" | "numeric";
  autoCapitalize?: "none" | "characters" | "sentences";
}) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        placeholder={placeholder}
        placeholderTextColor={baseColors.muted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={[styles.input, error ? { borderColor: baseColors.danger } : null]}
      />
      {error ? (
        <View style={{ flexDirection: "row", gap: space.xs, alignItems: "center" }}>
          <Icon name="alert-circle-outline" size={16} color={baseColors.danger} />
          <Text style={[styles.small, { color: baseColors.danger }]}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Option selector (radio-like) with 48 dp rows and selected state announced to TalkBack. */
export function OptionList<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; disabled?: boolean; hint?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
}) {
  const c = useColors();
  return (
    <View style={{ gap: space.xs }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={styles.label}>{label}</Text>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label + (o.hint ? `, ${o.hint}` : "")}
            accessibilityState={{ selected, disabled: !!o.disabled }}
            disabled={o.disabled}
            onPress={() => onChange(o.value)}
            style={[styles.option, selected && { borderColor: c.primary, backgroundColor: baseColors.infoBg }, o.disabled && { opacity: 0.5 }]}
          >
            <Icon name={selected ? "radiobox-marked" : "radiobox-blank"} color={selected ? c.primary : baseColors.muted} />
            <Text style={[styles.rowTitle, { flex: 1 }]}>{o.label}</Text>
            {o.hint ? <Text style={styles.small}>{o.hint}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function confirm(title: string, message: string, confirmText: string, onConfirm: () => void): void {
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmText, onPress: onConfirm, style: "destructive" },
  ]);
}

/** Always-visible connectivity banner: Online / Offline / Syncing, with pending count. Tap -> Sync status. */
export function ConnectivityBanner() {
  const netState = useAppStore((s) => s.netState);
  const syncing = useAppStore((s) => s.syncing);
  const pending = useAppStore((s) => s.pendingCount);
  const rejected = useAppStore((s) => s.rejectedCount);
  const session = useAppStore((s) => s.session);
  let icon = "cloud-check-outline";
  let text = "Online";
  let bg: string = baseColors.successBg;
  let fg: string = baseColors.success;
  if (netState === "offline") {
    icon = "cloud-off-outline";
    text = pending > 0 ? `Offline · ${pending} pending` : "Offline";
    bg = baseColors.neutralBg;
    fg = baseColors.onSurface;
  } else if (syncing || pending > 0) {
    icon = "sync";
    text = `Syncing ${pending} change${pending === 1 ? "" : "s"}...`;
    bg = baseColors.infoBg;
    fg = baseColors.info;
  } else if (rejected > 0) {
    icon = "alert-outline";
    text = `${rejected} change${rejected === 1 ? "" : "s"} not applied · View`;
    bg = baseColors.warningBg;
    fg = baseColors.warning;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Connection status: ${text}. Open sync status.`}
      accessibilityLiveRegion="polite"
      onPress={() => (session ? router.push("/sync") : router.push("/settings"))}
      style={[styles.banner, { backgroundColor: bg }]}
    >
      {syncing && netState === "online" ? <ActivityIndicator size="small" color={fg} /> : <Icon name={icon} size={18} color={fg} />}
      <Text style={[styles.bannerText, { color: fg }]}>{text}</Text>
    </Pressable>
  );
}

export function ToastHost() {
  const t = useAppStore((s) => s.toast);
  const hide = useAppStore((s) => s.hideToast);
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(hide, 3500);
    return () => clearTimeout(timer);
  }, [t, hide]);
  if (!t) return null;
  const tone = t.tone === "success" ? [baseColors.success, "check-circle-outline"] : t.tone === "error" ? [baseColors.danger, "alert-circle-outline"] : [baseColors.info, "information-outline"];
  return (
    <Pressable accessibilityRole="alert" accessibilityLiveRegion="assertive" onPress={hide} style={[styles.toast, { backgroundColor: tone[0] }]}>
      <Icon name={tone[1]} color="#FFFFFF" />
      <Text style={styles.toastText}>{t.text}</Text>
    </Pressable>
  );
}

/** Tenant logo + name header used at the top of every main tab. */
export function TenantHeader({ subtitle }: { subtitle?: string }) {
  const tenant = useAppStore((s) => s.session?.tenant);
  const c = useColors();
  return (
    <View style={[styles.tenant, { backgroundColor: c.primary }]}>
      {tenant?.logo_url ? (
        <Image source={{ uri: tenant.logo_url }} style={styles.logo} accessibilityLabel={`${tenant.name} logo`} />
      ) : (
        <Icon name="trophy-outline" size={28} color={c.onPrimary} label="League logo" />
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.tenantName, { color: c.onPrimary }]} numberOfLines={1}>
          {tenant?.name ?? "NaSCon League"}
        </Text>
        {subtitle ? (
          <Text style={[styles.small, { color: c.onPrimary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  button: {
    minHeight: TAP,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  buttonText: { fontSize: font.body, fontWeight: "700" },
  row: {
    minHeight: TAP + 8,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: baseColors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: baseColors.border,
  },
  rowTitle: { fontSize: font.body, color: baseColors.onSurface, fontWeight: "600" },
  rowSubtitle: { fontSize: font.small, color: baseColors.muted, marginTop: 2 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" },
  chipText: { fontSize: font.small, fontWeight: "700" },
  section: { fontSize: font.title, fontWeight: "700", color: baseColors.onSurface, marginTop: space.sm },
  card: { backgroundColor: baseColors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm, borderWidth: 1, borderColor: baseColors.border },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xl, minHeight: 200 },
  muted: { fontSize: font.body, color: baseColors.muted },
  emptyText: { fontSize: font.body, color: baseColors.onSurface, textAlign: "center" },
  small: { fontSize: font.small, color: baseColors.muted },
  stale: { flexDirection: "row", gap: space.xs, alignItems: "center", backgroundColor: baseColors.warningBg, padding: space.sm, borderRadius: radius.sm, marginBottom: space.sm },
  label: { fontSize: font.small, fontWeight: "700", color: baseColors.onSurface },
  input: {
    minHeight: TAP,
    borderWidth: 1,
    borderColor: baseColors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: font.body,
    color: baseColors.onSurface,
    backgroundColor: baseColors.surface,
  },
  option: {
    minHeight: TAP,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderColor: baseColors.border,
    borderRadius: radius.md,
    backgroundColor: baseColors.surface,
  },
  banner: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, paddingHorizontal: space.md },
  bannerText: { fontSize: font.small, fontWeight: "700" },
  toast: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    bottom: 90,
    minHeight: TAP,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    elevation: 6,
  },
  toastText: { color: "#FFFFFF", fontSize: font.body, flex: 1, fontWeight: "600" },
  tenant: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg },
  tenantName: { fontSize: font.title, fontWeight: "800" },
  logo: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFFFFF" },
});
