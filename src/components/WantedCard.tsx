import Link from 'next/link';
import type { WantedPostDTO } from '@/lib/types';
import { wantedCardCopy } from '@/lib/wanted-presentation';

export function WantedCard({ post }: { post: WantedPostDTO }) {
  const copy = wantedCardCopy(post);
  return (
    <Link href={`/wanted/${post.id}`} className="wanted-card">
      <div className="wanted-card__photo">
        {post.photo_urls[0]
          ? <img src={post.photo_urls[0]} alt="" />
          : <div className="wanted-card__placeholder" aria-hidden="true">WANTED</div>}
      </div>
      <div className="wanted-card__body">
        <h2>{post.title}</h2>
        <p>{post.location} · {copy.deadline}</p>
        <div className="wanted-card__foot"><strong>{copy.budget}</strong><span>{post.status === 'active' ? copy.offers : post.status}</span></div>
      </div>
    </Link>
  );
}
