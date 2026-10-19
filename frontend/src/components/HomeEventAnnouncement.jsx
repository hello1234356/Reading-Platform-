import { Link } from "react-router-dom";
import { getExhibitionEvents } from "../config/exhibitions";
import { useEventsAccess } from "../context/eventsAccess";
import bookCatArt from "../assets/seasonal/halloween-book-cat.jpg";
import "./HomeEventAnnouncement.css";

export default function HomeEventAnnouncement() {
  const { canView, loading } = useEventsAccess();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const event = getExhibitionEvents().find(
    (item) => new Date(item.endDate + "T00:00:00") >= today,
  );
  if (loading || !canView || !event) return null;
  const formatDate = (value) =>
    new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })
      .format(new Date(value + "T00:00:00"));

  return (
    <Link className="home-event-announcement" to={event.formPath}>
      <img src={bookCatArt} alt="" />
      <div className="home-event-announcement-copy">
        <span>{formatDate(event.startDate)} - {formatDate(event.endDate)}</span>
        <h2>{event.bannerTitle}</h2>
        <p>{event.bannerText}</p>
      </div>
      <strong>Recommend a Book <span aria-hidden="true">→</span></strong>
    </Link>
  );
}
