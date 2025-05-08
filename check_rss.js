const axios = require("axios");
const xml2js = require("xml2js");

(async () => {
  const feedURL = "https://www.catholicnewsagency.com/rss/news-vatican.xml";

  try {
    const { data } = await axios.get(feedURL);
    const parsed = await xml2js.parseStringPromise(data);
    const items = parsed.rss.channel[0].item || [];

    for (const item of items) {
      const title = item.title[0];
      if (/white smoke/i.test(title)) {
        console.log("White smoke detected:", title);

        await axios.post("https://api.pushover.net/1/messages.json", null, {
          params: {
            token: process.env.PUSHOVER_APP_TOKEN,
            user: process.env.PUSHOVER_USER_KEY,
            message: `White smoke — ${title}`,
            priority: 2,
            retry: 60,
            expire: 3600,
            sound: "alien"
          }
        });

        break;
      }
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
})();