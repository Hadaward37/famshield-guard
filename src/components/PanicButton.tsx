import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 220;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const HOLD_MS = 3000;

interface PanicButtonProps {
  onPanicTriggered: () => void;
  disabled?: boolean;
}

export default function PanicButton({ onPanicTriggered, disabled }: PanicButtonProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const hapticTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const triggered = useRef(false);

  // strokeDashoffset vai de CIRCUMFERENCE (vazio) a 0 (cheio).
  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  });

  function clearHaptics() {
    hapticTimers.current.forEach(clearTimeout);
    hapticTimers.current = [];
  }

  function scheduleHaptics() {
    clearHaptics();
    hapticTimers.current = [
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 1000),
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 2000),
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 2900),
    ];
  }

  function startPress() {
    if (disabled) return;
    triggered.current = false;
    scheduleHaptics();
    animation.current = Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      // strokeDashoffset não é suportado pelo native driver.
      useNativeDriver: false,
    });
    animation.current.start();
  }

  function reset() {
    animation.current?.stop();
    clearHaptics();
    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }

  function handleLongPress() {
    if (disabled) return;
    triggered.current = true;
    clearHaptics();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    progress.setValue(0);
    onPanicTriggered();
  }

  function handlePressOut() {
    // Se o long press já disparou, não reseta (evita "piscar" o anel).
    if (triggered.current) return;
    reset();
  }

  useEffect(() => {
    return () => {
      clearHaptics();
      animation.current?.stop();
    };
  }, []);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPressIn={startPress}
        onPressOut={handlePressOut}
        onLongPress={handleLongPress}
        delayLongPress={HOLD_MS}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Botão de emergência SOS"
        accessibilityHint="Mantenha pressionado por 3 segundos para acionar o alerta"
        style={({ pressed }) => [
          styles.button,
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
          {/* trilho */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="#7F1D1D"
            strokeWidth={STROKE}
            fill="none"
          />
          {/* progresso */}
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="#FCA5A5"
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            // começa do topo
            rotation={-90}
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        </Svg>
        <Text style={styles.label}>{'SEGURAR\nPARA\nSOS'}</Text>
        <Text style={styles.subtext}>3 segundos</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 16,
  },
  pressed: { backgroundColor: '#B91C1C' },
  disabled: { backgroundColor: '#7F1D1D', opacity: 0.6 },
  label: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 1,
    lineHeight: 30,
  },
  subtext: { color: '#FCA5A5', fontSize: 13, marginTop: 8, fontWeight: '600' },
});
