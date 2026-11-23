// Reading order spaces out festive excerpts and alternates themes across the cycle.
// Source comments point to the editions used to check the wording.
export const winterLiteraryQuotes = [
  // https://oss0.changxianggu.com/book/chapter/269_9787040191790.pdf
  {
    category: "snow",
    language: "zh-CN",
    quote: "雾凇沆砀，天与云与山与水，上下一白。",
    author: "张岱",
    source: "湖心亭看雪",
  },
  // https://en.wikisource.org/wiki/A_Christmas_Carol_(Dickens,_1843)/Stave_4
  {
    category: "festive",
    quote: "I will honour Christmas in my heart, and try to keep it all the year.",
    author: "Charles Dickens",
    source: "A Christmas Carol",
  },
  // Shanghai Classics Publishing House edition, as reproduced at https://dxyw0831.yibinu.edu.cn/__local/D/0E/D5/EA71BEF3739BF8CA5518DE97EC2_9EF997CA_C6919.pdf
  {
    category: "reflection",
    language: "zh-CN",
    quote: "风一更，雪一更，聒碎乡心梦不成，故园无此声。",
    author: "纳兰性德",
    source: "长相思·山一程",
  },
  // https://www.gutenberg.org/cache/epub/36308/pg36308-images.html
  {
    category: "snow",
    quote: "In winter, when the fields are white,\nI sing this song for your delight—",
    author: "Lewis Carroll",
    source: "Through the Looking-Glass",
  },
  // https://tcmb.culture.tw/zh-tw/detail?id=140000000237&indexCode=MOCCOLLECTIONS
  {
    category: "reflection",
    language: "zh-CN",
    quote: "梅须逊雪三分白，雪却输梅一段香。",
    author: "卢梅坡",
    source: "雪梅",
  },
  // https://www.gutenberg.org/cache/epub/37106/pg37106-images.html
  {
    category: "festive",
    quote: "Christmas won’t be Christmas without any presents",
    author: "Louisa May Alcott",
    source: "Little Women",
  },
  // https://zh.wikisource.org/zh-hans/白雪歌送武判官歸京
  {
    category: "snow",
    language: "zh-CN",
    quote: "忽如一夜春风来，千树万树梨花开。",
    author: "岑参",
    source: "白雪歌送武判官归京",
  },
  // https://www.gutenberg.org/files/2814/2814-h/2814-h.htm
  {
    category: "reflection",
    quote: "His soul swooned slowly as he heard the snow falling faintly through the universe",
    author: "James Joyce",
    source: "The Dead, Dubliners",
  },
  // https://zh.wikisource.org/zh-hans/夜雪
  {
    category: "snow",
    language: "zh-CN",
    quote: "夜深知雪重，时闻折竹声。",
    author: "白居易",
    source: "夜雪",
  },
  // https://www.gutenberg.org/cache/epub/45/pg45-images.html
  {
    category: "festive",
    quote: "Anne reveled in the drive to the hall, slipping along over the satin-smooth roads with the snow crisping under the runners.",
    author: "L. M. Montgomery",
    source: "Anne of Green Gables",
  },
  // https://zh.wikisource.org/zh-hans/逢雪宿芙蓉山主人
  {
    category: "snow",
    language: "zh-CN",
    quote: "柴门闻犬吠，风雪夜归人。",
    author: "刘长卿",
    source: "逢雪宿芙蓉山主人",
  },
  // https://en.wikisource.org/wiki/Page:New_Hampshire_(Frost,_1923).djvu/101
  {
    category: "reflection",
    quote: "But I have promises to keep,\nAnd miles to go before I sleep,\nAnd miles to go before I sleep.",
    author: "Robert Frost",
    source: "Stopping by Woods on a Snowy Evening",
  },
  // https://www.gutenberg.org/cache/epub/30659/pg30659-images.html
  {
    category: "snow",
    quote: "Late lies the wintry sun a-bed,\nA frosty, fiery sleepy-head;\nBlinks but an hour or two; and then,\nA blood-red orange, sets again.",
    author: "Robert Louis Stevenson",
    source: "Winter-Time, A Child’s Garden of Verses",
  },
  // https://zh.wikisource.org/zh-hans/問劉十九
  {
    category: "festive",
    language: "zh-CN",
    quote: "晚来天欲雪，能饮一杯无？",
    author: "白居易",
    source: "问刘十九",
  },
  // English translation in Project Gutenberg #1597, listed as public domain in the US.
  // https://www.gutenberg.org/cache/epub/1597/pg1597-images.html
  {
    category: "reflection",
    quote: "they both had forgotten the cold empty splendor of the Snow Queen, as though it had been a dream.",
    author: "Hans Christian Andersen",
    source: "The Snow Queen",
  },
  // https://zh.wikisource.org/zh-hans/雪_(鲁迅)
  {
    category: "snow",
    language: "zh-CN",
    quote: "江南的雪，可是滋润美艳之至了",
    author: "鲁迅",
    source: "雪",
  },
  // https://www.folger.edu/explore/shakespeares-works/the-winters-tale/read/2/1/
  {
    category: "reflection",
    quote: "A sad tale’s best for winter.",
    author: "William Shakespeare",
    source: "The Winter’s Tale",
  },
  // https://en.wikisource.org/wiki/The_Four_Million/The_Gift_of_the_Magi
  {
    category: "festive",
    quote: "They invented the art of giving Christmas presents.",
    author: "O. Henry",
    source: "The Gift of the Magi",
  },
  // https://zh.wikisource.org/zh-hans/江雪
  {
    category: "reflection",
    language: "zh-CN",
    quote: "孤舟蓑笠翁，独钓寒江雪。",
    author: "柳宗元",
    source: "江雪",
  },
  // Fascicle 13 (F320/J258), transcribed at https://journeys.dartmouth.edu/whiteheat/december-24-31-1862-poems-on-winter/
  {
    category: "snow",
    quote: "There’s a certain Slant of light,\nWinter Afternoons –",
    author: "Emily Dickinson",
    source: "There’s a certain Slant of light",
  },
  // https://rpo.library.utoronto.ca/content/snow-man
  {
    category: "reflection",
    quote: "One must have a mind of winter\nTo regard the frost and the boughs\nOf the pine-trees crusted with snow;",
    author: "Wallace Stevens",
    source: "The Snow Man",
  },
];
