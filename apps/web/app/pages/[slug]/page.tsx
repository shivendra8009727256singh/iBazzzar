import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { tryServerApi } from '@/lib/server-api';
import { formatDate } from '@/lib/format';

type Page = { page: { slug: string; title: string; body: string; updatedAt: string } };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await tryServerApi<Page>(`/pages/${slug}`, { revalidate: 300 });
  return { title: data?.page.title ?? 'Page not found' };
}

/** Renders CMS text safely: paragraphs, "## " headings, "- " lists and "> " notes. No HTML from the CMS is trusted. */
function Body({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="prose-page">
      {blocks.map((b, i) => {
        const t = b.trim();
        if (t.startsWith('## ')) return <h2 key={i}>{t.slice(3)}</h2>;
        if (t.startsWith('> ')) return <blockquote key={i}>{t.replace(/^> ?/gm, '')}</blockquote>;
        if (t.split('\n').every((l) => l.startsWith('- '))) return <ul key={i} className="list-disc pl-5 grid gap-1">{t.split('\n').map((l) => <li key={l}>{l.slice(2)}</li>)}</ul>;
        return <p key={i}>{t}</p>;
      })}
    </div>
  );
}

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await tryServerApi<Page>(`/pages/${slug}`, { revalidate: 300 });
  if (!data) notFound();
  return (
    <article className="container-page py-10 max-w-3xl">
      <span className="eyebrow">IBazzzar policies</span>
      <h1 className="text-4xl mt-2">{data.page.title}</h1>
      <p className="text-sm text-muted mt-2 mb-8">Last updated {formatDate(data.page.updatedAt)}</p>
      <Body text={data.page.body} />
    </article>
  );
}
