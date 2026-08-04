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

// Bell icon with a presence dot for event notifications.
function NotificationsIcon({ color, size }: { color: string; size: number }) {
  const { eventsCount } = useUnread();
  return (
    <View>
      <Feather name="bell" color={color} size={size} />
      {eventsCount > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: T.cardinal,
          }}
        />
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
        options={{ tabBarIcon: ({ color, size }) => <Feather name="home" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="requests"
        options={{ tabBarIcon: ({ color, size }) => <RequestsIcon color={color} size={size} /> }}
      />
      {/* Post — raised center button, rounded square, no glow */}
      <Tabs.Screen
        name="post"
        options={{
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
        name="notifications"
        options={{ tabBarIcon: ({ color, size }) => <NotificationsIcon color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} /> }}
      />
      {/* Hidden routes — not tabs */}
      <Tabs.Screen name="saved" options={{ href: null }} />
      <Tabs.Screen name="my-listings" options={{ href: null }} />
      <Tabs.Screen name="listing/[id]/index" options={{ href: null }} />
      <Tabs.Screen name="listing/[id]/edit" options={{ href: null }} />
      <Tabs.Screen name="u/[id]" options={{ href: null }} />
      <Tabs.Screen name="edit-profile" options={{ href: null }} />
      <Tabs.Screen name="terms" options={{ href: null }} />
      <Tabs.Screen name="privacy" options={{ href: null }} />
      <Tabs.Screen name="support" options={{ href: null }} />
    </Tabs>
  );
}
