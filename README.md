# Reading Social API

A small Express + SQLite backend for a school reading community. It supports the four main product pages: social feed, book clubs, discover, and student profiles.

## Run it

```bash
npm install
cp .env.example .env
npm run db:init
npm run db:seed
npm run dev
```

The API runs at `http://localhost:4000`. For prototype authentication, protected requests must include an `x-user-id` header. The seed script creates Yiru as user `1`.

## API map

| Page | Method and route | Purpose |
| --- | --- | --- |
| Feed | `GET /api/posts` | Paginated FYP posts |
| Feed | `POST /api/posts` | Create a post |
| Feed | `PUT/DELETE /api/posts/:id/like` | Like or unlike |
| Feed | `GET/POST /api/posts/:id/comments` | Read or add comments |
| Feed search | `GET /api/users?q=` | Search students |
| Clubs | `GET /api/clubs` | Browse clubs |
| Clubs | `POST /api/clubs` | Create a club and join as creator |
| Clubs | `POST /api/clubs/:id/join` | Join a club |
| Club chat | `GET/POST /api/clubs/:id/messages` | Members-only chat |
| Discover | `GET /api/books?q=&genre=` | Search books |
| Discover | `GET /api/books/featured` | Monthly quiz/list/article content |
| Discover | `PUT /api/books/:id/log` | Add or update a virtual-shelf book |
| Profile | `GET /api/profile/:userId` | Full profile dashboard in one response |
| Profile | `PATCH /api/users/:id` | Edit profile, favorites, genres, and streak |
| Profile | `PUT /api/profile/:userId/challenge` | Set an annual reading target |

### Log a book example

```bash
curl -X PUT http://localhost:4000/api/books/1/log \
  -H 'Content-Type: application/json' \
  -H 'x-user-id: 1' \
  -d '{"status":"Finished","rating":5,"review":"Loved it.","finish_date":"2026-06-22"}'
```

The full database definition is in `backend/database/schema.sql`. Counts for likes, comments, and club members are maintained by database triggers rather than trusted from the client.
