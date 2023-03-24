const mongoose = require("mongoose");
require("mongoose-long")(mongoose);
const Friendship = require("./friendship.model");
const home_timeline = require("./home_timeline.model");

const internal_setting = require("./internal_setting.model");
const Auth = require("./auth.model");

const userSchema = mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.Long, unique: true },
    id_str: { type: String, unique: true }, //defualt in post('save')
    name: String,
    screen_name: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    location: { type: String, default: "" },
    description: { type: String, default: "" },
    url: { type: String, default: "" },
    entities: {
      url: {
        urls: [
          {
            url: String,
            expanded_url: String,
            display_url: String,
            indices: [Number],
          },
        ],
      },
      description: {
        urls: [],
      },
    },
    protected: { type: Boolean, default: false },
    followers_count: { type: Number, default: 0 },
    friends_count: { type: Number, default: 0 },
    listed_count: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now() },
    favourites_count: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    statuses_count: { type: Number, default: 0 },
    default_profile_image: { type: Boolean, default: true },
    default_profile: { type: Boolean, default: true },
    profile_image_url_https: {
      type: String,
      default:
        "https://reedbarger.nyc3.digitaloceanspaces.com/default-avatar.png",
    },
    profile_banner: {
      type: String,
      default:
        "https://reedbarger.nyc3.digitaloceanspaces.com/twitter-cover.png",
    },
    profile_banner_url: { type: String, default: null },
    profile_banner_color: { type: String, default: null },
  },
  { id: false }
);
/**
 * @param {Object} with two userDat, authDat constaing password and/or sensitive data
 */
userSchema.statics.createNew = async function (userDat, authDat) {
  try {
    let user = await this.create(userDat);
    await Auth.createNew(user._id, authDat);
    return user;
  } catch (error) {
    console.log("error creating new user", error);
    throw error;
  }
};
userSchema.statics.countPosts = async function (user_id) {
  return mongoose.model("Post").countDocuments({ user: user_id });
};

userSchema.methods.validPassword = async function (password) {
  return Auth.validPassword(this._id, password);
};
/**
 * updates Friendship ans User.friends_count
 * then invokes home_timeline.bulkAddPosts()
 * @returns {Object} - like { ok: 1, ...otherinfo } if succesfull in adding friends
 */
userSchema.methods.follow = async function (...list_id_tobe_friends) {
  let res = { ok: 0 };
  try {
    let res1 = await Friendship.updateOne(
      { user_id: this._id },
      {
        $push: {
          friend_ids: {
            $each: list_id_tobe_friends,
            $position: 0,
          },
        },
      },
      { upsert: true }
    );
    if (res1.ok) {
      await this.update({
        $inc: { friends_count: 1 },
      });

      for (let id of list_id_tobe_friends) {
        await home_timeline.bulkAddPosts([this._id], { id_friend_added: id });
        //                  user_ids
      }
    }
    res = { ...res1 };
  } catch (err) {
    console.log("error in user.follow()", err);
  } finally {
    return res;
  }
};
/**
 * unfollow() similar to follow()
 */
userSchema.methods.unfollow = async function (...list_id_tobe_not_friends) {
  let res = { ok: 0 };
  try {
    let res1 = await Friendship.updateOne(
      { user_id: this._id },
      {
        $pull: {
          friend_ids: {
            $in: list_id_tobe_not_friends,
          },
        },
      },
      { upsert: true }
    );
    if (res1.ok) {
      await this.update({
        $inc: { friends_count: -1 },
      });

      // remove posts from home_timeline
      for (let id of list_id_tobe_not_friends) {
        await home_timeline.bulkRemovePosts([this._id], {
          id_friend_removed: id,
        });
        //                  user_ids
      }
    }
    res = { ...res1 };
  } catch (err) {
    console.log("error in user.unfollow()", err);
  } finally {
    return res;
  }
};

userSchema.statics.searchUser = function (query) {
  if (query.startsWith("@")) query = query.slice(1);
  query = new RegExp(query, "i");
  return this.find({
    $or: [{ screen_name: query }, { name: query }],
  }).limit(20);
};

userSchema.statics.getSuggestions = async function ({
  //username: screen_name = null,
  user_id = null,
}) {
  if (!user_id) throw Error("no user_id given");
  let { friend_ids } = await Friendship.findOne({ user_id });
  // personalised later on
  return this.find({
    _id: { $ne: user_id },
    _id: { $nin: friend_ids },
  })
    .sort("-followers_count -statuses_count -friends_count -created_at") // my social media algorithm (¬‿¬)
    .limit(25);
};

async function user_genId() {
  /**
   * generates simple incrementing value
   * last value alotted is stored in internals collection as last_id_allotted
   */
  await internal_setting.updateOne(
    { ver: "1.0" },
    {
      $inc: { current_user_id: 1 },
    },
    { upsert: true }
  );
  let { current_user_id } = await internal_setting.findOne(
    { ver: "1.0" },
    "current_user_id"
  );
  return current_user_id;
}
userSchema.post("save", async (doc, next) => {
  /**
   * generates id
   * keep it minimum
   */
  if (!doc.id) {
    let id = await user_genId();
    await mongoose.model("User").updateOne(
      { _id: doc._id },
      {
        $set: {
          id: id,
          id_str: id.toString(),
        },
      }
    );
  }
  next();
});
const { getRandomProfileUrl } = require("../utils/helpers");
userSchema.post("save", async (doc) => {
  // make empty timeline
  await home_timeline.create({
    user_id: doc._id,
  });
  await Friendship.create({
    user_id: doc._id,
  });
  if (!doc.profile_image_url_https) {
    await mongoose.model("User").updateOne(
      { _id: doc._id },
      {
        profile_image_url_https: getRandomProfileUrl(),
        default_profile_image: false,
      }
    );
  }
});

module.exports = mongoose.model("User", userSchema);
