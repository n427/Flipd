import { useLocalSearchParams } from 'expo-router';
import { WantedPostFormScreen } from '../post';
export default function EditWantedPost() { const { id } = useLocalSearchParams<{ id: string }>(); return <WantedPostFormScreen initialId={id} />; }
