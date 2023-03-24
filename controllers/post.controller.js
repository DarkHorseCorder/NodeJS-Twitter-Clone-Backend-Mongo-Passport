const Post = require("../models/post.model");
const PostEngagement = require("../models/post_engagement.model");
const Friendship = require("../models/friendship.model");
const {
  serializePost,
  serializePosts,
} = require("../serializers/post.serializer");
const { serializeUsers } = require("../serializers/user.serializer");
const assert = require("assert");
const { filterInput } = require("../utils/helpers");

exports.createPost = async (req, res, next) => {
  try {
    let user = req.user;
    let body = req.body;
    let { text, ...rest } = body;
    text = filterInput(text, "html", { max_length: 500, identifier: "Post" });
    body = {
      text,
      ...rest,
    };
    let post = await Post.addOne({ user_id: user._id }, body);
    post = await serializePost(post, req.user);
    res.status(200).json({
      msg: "post was succesfully added",
      post,
    });
  } catch (err) {
    next(err);
  }
};
exports.getPost = async (req, res, next) => {
  try {
    let postId = req.params.postId;
    let post = await Post.findOne({ id_str: postId });
    if (!post) {
      res.status(400).json({ msg: "Bad request" });
      return;
    }
    post = await serializePost(post, req.user);
    res.status(200).json({
      post,
    });
  } catch (err) {
    next(err);
  }
};
exports.likePost = async (req, res, next) => {
  try {
    let postId = req.params.postId;
    let user = req.user;
    let responce = await Friendship.postLiked(user._id, { postId });
    if (responce.ok) res.json({ message: "Post was liked" });
    else throw Error("Error in like post");
  } catch (err) {
    next(err);
  }
};
exports.unlikePost = async (req, res, next) => {
  try {
    let postId = req.params.postId;
    let user = req.user;
    let responce = await Friendship.postUnliked(user._id, { postId });
    if (responce.ok) res.json({ message: "Post was unliked" });
    else throw Error("Error in unlike post");
  } catch (err) {
    next(err);
  }
};
exports.repostPost = async (req, res, next) => {
  try {
    let post = req.body;
    let { text, ...rest } = post;
    text = filterInput(text, "html", { max_length: 500, identifier: "Post" });
    post = {
      text,
      ...rest,
    };
    let form = {
      text: `RT @${post.user.screen_name}: ${post.text.slice(0, 50)}`,
      retweeted_status: post._id,
    };
    let user = req.user;
    await Post.addOne({ user_id: user._id }, form);
    await Friendship.postReposted(user._id, { postId: post.id_str });
    res.json({
      message: "Successfully reposted",
    });
  } catch (err) {
    next(err);
  }
};
exports.unrepostPost = async (req, res, next) => {
  try {
    let post = req.body;
    let user = req.user;
    assert.ok(user);
    let doc = await Post.findOne({ retweeted_status: post._id });
    await doc.deleteOne();
    await Friendship.postUnreposted(user._id, { post_id: post._id });
    res.json({
      message: "Succesfully Unreposted",
    });
  } catch (err) {
    next(err);
  }
};
exports.getLikes = async (req, res, next) => {
  try {
    let { postId } = req.params;
    let p = req.query["p"];
    p = parseInt(p); //page/batch number
    const s = 15; //size of page/batch

    const post = await Post.findOne({ id_str: postId }, "_id");
    if (!post) return res.status(400).json({ msg: "Bad request" });

    let doc = await PostEngagement.findOne(
      { post_id: post._id },
      {
        liked_by: {
          $slice: [s * (p - 1), s],
        },
      }
    ).populate("liked_by");
    if (!doc) return res.json({ users: [] });
    let users = await serializeUsers(doc.liked_by, req.user);
    res.json({ users });
  } catch (err) {
    next(err);
  }
};
exports.getReposts = async (req, res, next) => {
  try {
    let { postId } = req.params;
    let p = req.query["p"];
    p = parseInt(p); //page/batch number
    const s = 15; //size of page/batch

    const post = await Post.findOne({ id_str: postId }, "_id");
    if (!post) return res.status(400).json({ msg: "Bad request" });

    let doc = await PostEngagement.findOne(
      { post_id: post._id },
      {
        reposted_by: {
          $slice: [s * (p - 1), s],
        },
      }
    ).populate("reposted_by");
    if (!doc) return res.json({ users: [] });
    let users = await serializeUsers(doc.reposted_by, req.user);
    res.json({ users });
  } catch (err) {
    next(err);
  }
};
exports.getReplies = async (req, res, next) => {
  try {
    const postId = req.params.postId;
    let p = req.query["p"];
    p = parseInt(p); //page/batch number
    const s = 15; //size of page/batch

    const post = await Post.findOne({ id_str: postId });
    if (!post) return res.status(400).json({ msg: "Bad request" });

    const doc = await PostEngagement.findOne(
      { post_id: post._id },
      {
        reply_posts: {
          $slice: [s * (p - 1), s],
        },
      }
    ).populate("reply_posts");
    if (!doc) return res.json({ posts: [] });
    const posts = await serializePosts(doc.reply_posts, req.user);
    res.json({ posts });
  } catch (err) {
    next(err);
  }
};

exports.replyToPost = async (req, res, next) => {
  try {
    const postId = req.params.postId;
    const user = req.user;
    let post = req.body;
    let { text, ...rest } = post;
    text = filterInput(text, "html", { max_length: 500, identifier: "Post" });
    post = {
      text,
      ...rest,
    };

    const targetPost = await Post.findOne({ id_str: postId }).populate("user");
    if (!targetPost) return res.status(400).json({ msg: "Bad request" });

    let form = {
      ...post,
      in_reply_to_status_id: targetPost.id,
      in_reply_to_status_id_str: targetPost.id_str, //would be string anyway
      in_reply_to_user_id: targetPost.user.id,
      in_reply_to_user_id_str: targetPost.user.id_str,
      in_reply_to_screen_name: targetPost.user.screen_name,
      quoted_status: targetPost._id, //just for UI to look good
      is_quote_status: false, //maybe use this to distinguish
    };
    post = await Post.addOne({ user_id: user._id }, form);
    if (post) {
      //no error proceed
      await PostEngagement.gotReplied(targetPost._id, post._id);
      post = await serializePost(post, req.user);
      res.json({ msg: "Ok", post });
    } else throw new Error("Post.addOne responce not ok");
  } catch (err) {
    next(err);
  }
};
