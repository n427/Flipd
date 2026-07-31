import { View, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { T, F } from '@/lib/theme';
import { useUnread } from '@/lib/unread';

// Bell icon with an unread-count badge for the Requests tab.
function RequestsIcon({ color, size }: { color: string; size: number }) {
  const { count } = useUnread();
  return (
    <View>
      <Ionicons name="notifications" color={color} size={size} />
      {count > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -7,
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
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="requests"
        options={{ tabBarIcon: ({ color, size }) => <RequestsIcon color={color} size={size} /> }}
      />
      {/* Post — prominent raised center button */}
      <Tabs.Screen
        name="post"
        options={{
          tabBarIcon: () => (
            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 29,
                backgroundColor: T.cardinal,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: -18,
                shadowColor: T.cardinal,
                shadowOpacity: 0.35,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 6,
              }}
            >
              <Ionicons name="add" color="#fff" size={32} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }}
      />
      {/* Hidden routes — not tabs */}
      <Tabs.Screen name="saved" options={{ href: null }} />
      <Tabs.Screen name="listing/[id]/index" options={{ href: null }} />
      <Tabs.Screen name="listing/[id]/edit" options={{ href: null }} />
      <Tabs.Screen name="u/[id]" options={{ href: null }} />
      <Tabs.Screen name="edit-profile" options={{ href: null }} />
    </Tabs>
  );
}
