import { Link, useParams } from "react-router-dom";
import { recommendationLists } from "../data/recommendationLists";

function getCoverUrl(isbn) {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
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
  const bodyPieces = post.body.split(new RegExp(`(${headings.join("|")})`));
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
        {sections.map((section, index) => (
          <section className="era-recommendation" key={section.heading}>
            <div className="era-cover-wrap">
              <img
                src={getCoverUrl(section.isbn)}
                alt={`${section.heading} cover`}
                loading="lazy"
              />
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
        ))}
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
          Back to Discovery
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
        Back to Discovery
      </Link>
      <article className="blog-post-shell">
        <header className="blog-post-hero">
          <img src={post.imageUrl} alt="" />
          <div>
            <p>{post.kicker}</p>
            <h1>{post.title}</h1>
            {post.author ? <small>By {post.author}</small> : null}
            <span>{post.count} books</span>
          </div>
        </header>
        {renderPostBody(post)}
      </article>
    </section>
  );
}

export default RecommendationPost;
