const mongoose = require("mongoose");
const Hashtag = require("./hashtag.model");

const trendSchema = mongoose.Schema({
  trends: [
    {
      name: {
        type: String,
        required: true,
      },
      url: String,
      promoted_content: {
        type: String,
        default: null,
      },
      query: String,
      tweet_volume: Number,
    },
  ],
  as_of: {
    type: Date,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  locations: [
    {
      name: String,
      woeid: {
        type: Number,
        required: true,
      },
    },
  ],
});
var trendInterval;
trendSchema.statics.refreshTrends = async function () {
  if (!trendInterval) {
    trendInterval = setInterval(async () => {
      await this.refreshTrends();
    }, 30 * 1000);
  }
  console.log("refreshing trends");
  (await Hashtag.find({})).forEach(async (tag) => {
    const dt = tag.updated_at || tag.created_at;
    if (!dt || !tag.tweet_volume) return;
    const score = (tag.tweet_volume * 10000000) / (Date.now() - dt);
    tag.score = score;
    await tag.save();
  });
  let trends = await Hashtag.find({}).sort("-score -tweet_volume").limit(20);
  trends = trends.map((obj) => ({
    name: obj.name,
    tweet_volume: obj.tweet_volume,
    query: encodeURIComponent(obj.name),
  }));
  if (!(await this.exists({ "locations.woeid": 1 }))) {
    this.create({
      locations: [
        {
          name: "Worldwide",
          woeid: 1,
        },
      ],
    });
  }
  return this.updateOne(
    { "locations.woeid": 1 },
    {
      $set: { trends: trends },
    }
  );
};

module.exports = mongoose.model("Trend", trendSchema);
