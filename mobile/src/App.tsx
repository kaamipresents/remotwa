// App.tsx — Navigation root with persistent connection tabs
// Implements windows-audio-remote-spec.md Section 4 (Navigation)

import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { PlayerScreen } from './screens/PlayerScreen';
import { MixerScreen } from './screens/MixerScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { DevicesScreen } from './screens/DevicesScreen';
import { PairingScreen } from './screens/PairingScreen';
import { useDeviceStore } from './store/useDeviceStore';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#18181b',
          borderTopColor: '#27272a',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: '#71717a',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Player"
        component={PlayerScreen}
        options={{
          tabBarLabel: 'Player',
        }}
      />
      <Tab.Screen
        name="Mixer"
        component={MixerScreen}
        options={{
          tabBarLabel: 'Mixer',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const connectionState = useDeviceStore((s) => s.connectionState);
  const activeDevice = useDeviceStore((s) => s.activeDevice);

  // If no device is connected or saved, initial route is Devices
  const initialRouteName = activeDevice ? 'MainTabs' : 'Devices';

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#09090b' },
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabNavigator} />
        <Stack.Screen
          name="Devices"
          component={DevicesScreen}
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="Pairing"
          component={PairingScreen}
          options={{ presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
