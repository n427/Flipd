import { View, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { T, F } from '@/lib/theme';
import { useUnread } from '@/lib/unread';

// Message icon with an unread-count badge for the Requests tab.
function RequestsIcon({ color, size }: { color: string; size: number }) {
  const { count } = useUnread();
  return (
    <View>
      <Feather name="message-circle" color={color} size={size} />
      {count > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -5,
            right: -8,
            minWidth: 17,
            height: 17,
            borderRadius: 9,
            backgroundColor: T.cardinal,
            paddingHorizontal: 4,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: F.bold, fontSize: 10.5, color: '#fff' }}>
            {count > 9 ? '9+' : count}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: T.cardinal,
        tabBarInactiveTintColor: T.muted,
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: { backgroundColor: T.surface, borderTopColor: T.rule, height: 88, paddingTop: 8 },
        sceneStyle: { backgroundColor: T.bg },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{ title: 'Home', tabBarAccessibilityLabel: 'Home marketplace', tabBarIcon: ({ color, size }) => <Feather name="home" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="wanted"
        options={{ title: 'Wanted', tabBarAccessibilityLabel: 'Wanted marketplace', tabBarIcon: ({ color, size }) => <Feather name="search" color={color} size={size} /> }}
      />
      {/* Post — raised center button, rounded square, no glow */}
      <Tabs.Screen
        name="post"
        options={{
          title: 'Post',
          tabBarAccessibilityLabel: 'Create a post',
          tabBarIcon: () => (
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                backgroundColor: T.cardinal,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: -16,
              }}
            >
              <Feather name="plus" color="#fff" size={28} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{ title: 'Requests', tabBarAccessibilityLabel: 'Requests and messages', tabBarIcon: ({ color, size }) => <RequestsIcon color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarAccessibilityLabel: 'Your profile', tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} /> }}
      />
      <Tabs.Screen name="notifications" options={{ href: null, title: 'Notifications' }} />
    </Tabs>
  );
}
