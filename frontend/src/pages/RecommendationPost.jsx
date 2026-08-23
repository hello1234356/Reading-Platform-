import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { recommendationLists } from "../data/recommendationLists";
import { getGoogleBooksCoverUrl } from "../lib/googleBooks";

function getCoverUrl(isbn) {
  return getGoogleBooksCoverUrl(isbn);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSectionCoverUrl(section) {
  return section.coverUrl || getCoverUrl(section.isbn);
}

function SectionCover({ section }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const coverUrl = getSectionCoverUrl(section);
  const title = section.title || section.heading;

  if (coverUrl && !coverFailed) {
    return (
      <img
        src={coverUrl}
        alt={`${title} cover`}
        loading="lazy"
        onError={() => setCoverFailed(true)}
      />
    );
  }

  return (
    <div className="era-cover-title-card">
      <strong>{title}</strong>
      {section.author ? <small>{section.author}</small> : null}
    </div>
  );
}

function renderPostBody(post) {
  if (!post.body || !post.sectionMeta) {
    return post.body ? (
      <div className="blog-post-body">{post.body}</div>
    ) : (
      <p className="blog-placeholder">{post.blurb}</p>
    );
  }

  const headings = post.sectionMeta.map((section) => section.heading);
  const bodyPieces = post.body.split(new RegExp(`(${headings.map(escapeRegExp).join("|")})`));
  const intro = bodyPieces[0]?.trim();
  const sections = [];

  for (let index = 1; index < bodyPieces.length; index += 2) {
    const heading = bodyPieces[index];
    const text = bodyPieces[index + 1]?.trim() || "";
    const meta = post.sectionMeta.find((section) => section.heading === heading);

    sections.push({
      heading,
      text,
      ...meta,
    });
  }

  return (
    <div className="blog-post-body designed">
      {intro ? <p className="blog-post-intro">{intro}</p> : null}
      <div className="era-recommendation-grid">
        {sections.map((section, index) => {
          return (
            <section className="era-recommendation" key={section.heading}>
              <div className="era-cover-wrap">
                <SectionCover section={section} />
              </div>
              <div className="era-copy">
                <div className="era-title-row">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h2>{section.heading}</h2>
                  </div>
                </div>
                <p className="era-body">{section.text}</p>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function RecommendationPost() {
  const { listSlug } = useParams();
  const post = recommendationLists.find((list) => list.slug === listSlug);

  if (!post) {
    return (
      <section className="home-page blog-post-page">
        <Link className="blog-back-link" to="/discover">
          Back to Discover
        </Link>
        <article className="blog-post-shell">
          <p className="eyebrow">Recommendation Post</p>
          <h1>Post not found.</h1>
          <p className="blog-placeholder">
            This list may still be waiting for its first draft.
          </p>
        </article>
      </section>
    );
  }

  return (
    <section className="home-page blog-post-page">
      <Link className="blog-back-link" to="/discover">
        Back to Discover
      </Link>
      <article
        className={`blog-post-shell ${post.language === "zh" ? "chinese-post" : ""} post-${post.slug}`}
      >
        <header className="blog-post-hero">
          {post.imageUrl ? (
            <img src={post.imageUrl} alt="" />
          ) : (
            <div className="blog-post-title-card" aria-hidden="true">
              <span>{post.kicker}</span>
              <strong>{post.coverTitle || post.title}</strong>
            </div>
          )}
          <div>
            <p>{post.kicker}</p>
            <h1>{post.title}</h1>
            {post.username ? <small>By {post.username}</small> : null}
            <span>{post.count} books</span>
          </div>
        </header>
      {renderPostBody(post)}
      </article>
    </section>
  );
}

export default RecommendationPost;
