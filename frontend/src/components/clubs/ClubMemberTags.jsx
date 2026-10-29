import { getClubTagClass } from '../../lib/clubMemberProfile';

export default function ClubMemberTags({ tags }) {
  return tags.map(tag => <span className={getClubTagClass(tag)} key={tag.id}>{tag.name}</span>);
}
