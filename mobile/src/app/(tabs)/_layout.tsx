import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@/lib/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: T.cardinal,
        tabBarInactiveTintColor: T.muted,
        headerShown: true,
        headerStyle: { backgroundColor: T.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: T.ink, fontWeight: '800' },
        tabBarStyle: { backgroundColor: T.surface, borderTopColor: T.rule },
        sceneStyle: { backgroundColor: T.bg },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{ title: 'Feed', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="post"
        options={{ title: 'Post', tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="requests"
        options={{ title: 'Requests', tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
