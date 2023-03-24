const mongoose = require("mongoose");
const PostEngagement = require("./post_engagement.model");

const friendshipSchema = mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  follower_ids: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  friend_ids: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  reposted_ids: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
    },
  ],
  liked_posts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
    },
  ],
});
friendshipSchema.statics.countFriends = async function (user_id) {
  let doc = await this.findOne({ user_id }, "friend_ids");
  if (!doc || !doc.friend_ids) return 0;
  let length = doc.friend_ids.length;
  if (doc.friend_ids.includes(user_id)) length--;
  return length;
};
friendshipSchema.statics.countFollowers = async function (user_id) {
  let doc = await this.findOne({ user_id }, "follower_ids");
  if (!doc || !doc.follower_ids) return 0;
  let length = doc.follower_ids.length;
  if (doc.follower_ids.includes(user_id)) length--;
  return length;
};

/**
 * checks if user1 is following user2
 * @param {*} user1_id
 * @param {*} user2_id
 */
friendshipSchema.statics.isFollowing = async function (
  user1_id = null,
  user2_id = null
) {
  return this.exists({
    user_id: user1_id,
    friend_ids: user2_id,
  });
};
/**
 * checks if user1 is being followed user2
 * @param {*} user1_id
 * @param {*} user2_id
 */
friendshipSchema.statics.isFollowed = async function (
  user1_id = null,
  user2_id = null
) {
  return this.exists({
    user_id: user1_id,
    follower_ids: user2_id,
  });
};
/**
 * checks if user likes post
 * @param {*} user_id
 * @param {*} post_id
 */
friendshipSchema.statics.isLiked = async function (
  user_id = null,
  post_id = null
) {
  return this.exists({
    user_id,
    liked_posts: post_id,
  });
};
friendshipSchema.statics.isReposted = async function (
  user_id = null,
  post_id = null
) {
  return this.exists({
    user_id,
    reposted_ids: post_id,
  });
};

friendshipSchema.statics.postLiked = async function (
  user_id = null,
  { post_id, postId }
) {
  if (postId) {
    post = await mongoose.model("Post").findOne({ id_str: postId }, "_id");
    post_id = post._id;
  } else if (!post_id) throw Error("Cannot determine post");
  let liked = await this.isLiked(user_id, post_id);
  if (liked) return { ok: 1, nModified: 0 };
  let res1 = await this.updateOne(
    { user_id },
    {
      // $push: { liked_posts:  post_id }
      $push: {
        liked_posts: {
          $each: [post_id],
          $position: 0,
        },
      },
    },
    { upsert: true }
  );

  await PostEngagement.gotLiked(post_id, user_id);
  return res1;
};
friendshipSchema.statics.postUnliked = async function (
  user_id = null,
  { post_id, postId }
) {
  if (postId) {
    post = await mongoose.model("Post").findOne({ id_str: postId }, "_id");
    post_id = post._id;
  } else if (!post_id) throw Error("Cannot determine post");
  let liked = await this.isLiked(user_id, post_id);
  if (!liked) return { ok: 1, nModified: 0 };
  let res1 = await this.updateOne(
    { user_id },
    {
      $pull: { liked_posts: post_id },
    }
  );

  await PostEngagement.gotUnliked(post_id, user_id);
  return res1;
};
friendshipSchema.statics.postReposted = async function (
  user_id = null,
  { post_id, postId }
) {
  if (postId) {
    post = await mongoose.model("Post").findOne({ id_str: postId }, "_id");
    post_id = post._id;
  } else if (!post_id) throw Error("Cannot determine post");
  let reposted = await this.isReposted(user_id, post_id);
  if (reposted) return { ok: 1, nModified: 0 };
  let res1 = await this.updateOne(
    { user_id },
    {
      // $push: { reposted_ids: post_id }
      $push: {
        reposted_ids: {
          $each: [post_id],
          $position: 0,
        },
      },
    }
  );

  await PostEngagement.gotReposted(post_id, user_id);
  return res1;
};
friendshipSchema.statics.postUnreposted = async function (
  user_id = null,
  { post_id, postId }
) {
  if (postId) {
    post = await mongoose.model("Post").findOne({ id_str: postId }, "_id");
    post_id = post._id;
  }
  if (!post_id) throw Error("Cannot determine post");
  let reposted = await this.isReposted(user_id, post_id);
  if (!reposted) return { ok: 1, nModified: 0 };
  let res1 = await this.updateOne(
    { user_id },
    {
      $pull: { reposted_ids: post_id },
    }
  );

  await PostEngagement.gotUnreposted(post_id, user_id);
  return res1;
};
/**
 * when user1 got followed by user2
 * @param {*} user1_id
 * @param {*} user2_id
 */
friendshipSchema.statics.gotFollowed = async function (
  user1_id = null,
  user2_id = null
) {
  let follower = await this.isFollowed(user1_id, user2_id);
  if (follower)
    //already follower, skip(bug in front-end app)
    return { ok: 1, nModified: 0 };
  await mongoose.model("User").findByIdAndUpdate(user1_id, {
    $inc: { followers_count: 1 },
  }); // retrieved from serializer now
  await mongoose.model("Notification").push(user1_id, {
    type: "followed",
    title: `You were followed`,
    body: {
      user: user2_id,
    },
  });
  return this.updateOne(
    { user_id: user1_id },
    {
      // $push: { follower_ids: user2_id }
      $push: {
        follower_ids: {
          $each: [user2_id],
          $position: 0,
        },
      },
    },
    { upsert: true }
  );
};
/**
 * contrary to gotFollowed
 * when user1 got unfollowed by user2
 * @param {*} user1_id
 * @param {*} user2_id
 */
friendshipSchema.statics.gotUnfollowed = async function (
  user1_id = null,
  user2_id = null
) {
  let follower = await this.isFollowed(user1_id, user2_id);
  if (!follower)
    //not a follower, skip. (bug in front-end app)
    return { ok: 1, nModified: 0 };
  await mongoose.model("User").findByIdAndUpdate(user1_id, {
    $inc: { followers_count: -1 },
  }); // retrieved from serializer now
  await mongoose.model("Notification").push(user1_id, {
    type: "unfollowed",
    title: `You were unfollowed`,
    body: {
      user: user2_id,
    },
  });
  return this.updateOne(
    { user_id: user1_id },
    {
      $pull: { follower_ids: user2_id },
    }
  );
};

module.exports = mongoose.model("Friendship", friendshipSchema);
