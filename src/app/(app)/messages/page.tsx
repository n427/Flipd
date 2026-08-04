import { redirect } from 'next/navigation';

// Conversations moved into the combined inbox at /requests, alongside the
// requests that create them. Individual threads still live at /messages/<id>.
export default function MessagesPage() {
  redirect('/requests');
}
