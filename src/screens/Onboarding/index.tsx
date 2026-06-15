import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

export default function OnboardingScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Onboarding</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg,
    alignItems: 'center', justifyContent: 'center' },
  text: { color: theme.colors.text, fontSize: 24, fontWeight: '600' },
});
