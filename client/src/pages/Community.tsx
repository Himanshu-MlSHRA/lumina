import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';

interface Group {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  memberCount: number;
  isJoined: boolean;
}

interface Post {
  id: string;
  content: string;
  imageUrl: string | null;
  isAnonymous: boolean;
  createdAt: string;
  author: { id: string; displayName: string; avatarUrl: string | null };
  group: { id: string; name: string };
  likeCount: number;
  isLiked: boolean;
}

interface Conversation {
  user: { id: string; displayName: string; avatarUrl: string | null };
  lastMessage: { content: string; createdAt: string; isFromMe: boolean } | null;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

const Community: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [groups, setGroups] = useState<Group[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [showPostForm, setShowPostForm] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postAnonymous, setPostAnonymous] = useState(false);
  const [postImage, setPostImage] = useState<File | null>(null);
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [tab, setTab] = useState<'feed' | 'messages'>('feed');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = () => {
    api.get('/groups').then(d => setGroups(d.groups)).catch(console.error);
    const url = selectedGroup ? `/posts?groupId=${selectedGroup}` : '/posts';
    api.get(url).then(d => setPosts(d.posts)).catch(console.error);
    api.get('/messages/conversations').then(d => setConversations(d.conversations || [])).catch(() => {});
  };

  useEffect(() => { loadData(); }, [selectedGroup]);

  const joinGroup = async (id: string) => {
    await api.post(`/groups/${id}/join`, {});
    loadData();
  };

  const leaveGroup = async (id: string) => {
    await api.post(`/groups/${id}/leave`, {});
    loadData();
  };

  const toggleLike = async (postId: string) => {
    // Optimistic update
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, isLiked: !p.isLiked, likeCount: p.isLiked ? p.likeCount - 1 : p.likeCount + 1 } : p));
    try {
      const res = await api.post(`/posts/${postId}/like`, {});
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, isLiked: res.liked, likeCount: res.count } : p));
    } catch {
      // Revert
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, isLiked: !p.isLiked, likeCount: p.isLiked ? p.likeCount - 1 : p.likeCount + 1 } : p));
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPostImage(file);
    setPostImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setPostImage(null);
    if (postImagePreview) URL.revokeObjectURL(postImagePreview);
    setPostImagePreview(null);
  };

  const submitPost = async () => {
    if (!postContent.trim() || !selectedGroup) return;
    setUploading(true);
    try {
      let imageUrl: string | undefined;
      if (postImage) {
        const uploadRes = await api.upload('/upload', postImage);
        imageUrl = uploadRes.imageUrl;
      }
      await api.post('/posts', { groupId: selectedGroup, content: postContent, isAnonymous: postAnonymous, imageUrl });
      setPostContent('');
      setShowPostForm(false);
      setPostAnonymous(false);
      removeImage();
      loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    await api.post('/groups', { name: newGroupName, description: newGroupDesc });
    setNewGroupName('');
    setNewGroupDesc('');
    setShowCreateGroup(false);
    loadData();
  };

  const timeAgo = (date: string) => {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const joinedGroups = groups.filter(g => g.isJoined);
  const discoverGroups = groups.filter(g => !g.isJoined);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 pb-24">
      {/* Header */}
      <motion.header variants={item} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Community</h1>
          <p className="text-slate-500 text-sm">Connect, share, and grow together.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateGroup(true)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all flex items-center gap-2 hover:scale-105 active:scale-95"
          >
            <i className="fas fa-plus text-xs"></i> New Group
          </button>
          {selectedGroup && joinedGroups.some(g => g.id === selectedGroup) && (
            <button
              onClick={() => setShowPostForm(true)}
              className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-4 py-2.5 rounded-xl font-semibold shadow-lg shadow-indigo-200/50 hover:shadow-xl transition-all flex items-center gap-2 text-sm hover:scale-105 active:scale-95"
            >
              <i className="fas fa-feather text-xs"></i> Share
            </button>
          )}
        </div>
      </motion.header>

      {/* Tabs */}
      <motion.div variants={item} className="flex gap-1 bg-slate-100 rounded-2xl p-1 max-w-xs">
        {(['feed', 'messages'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === t
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <i className={`fas ${t === 'feed' ? 'fa-newspaper' : 'fa-envelope'} mr-2 text-xs`}></i>
            {t === 'feed' ? 'Feed' : 'Messages'}
          </button>
        ))}
      </motion.div>

      {tab === 'feed' ? (
        <>
          {/* Group Pills */}
          <motion.div variants={item} className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => setSelectedGroup(null)}
              className={`flex-shrink-0 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                !selectedGroup
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200/50'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
              }`}
            >
              All
            </button>
            {groups.map(g => (
              <button
                key={g.id}
                onClick={() => setSelectedGroup(g.id)}
                className={`flex-shrink-0 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 ${
                  selectedGroup === g.id
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200/50'
                    : g.isJoined
                      ? 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
                      : 'bg-slate-50 border border-slate-100 text-slate-400'
                }`}
              >
                {g.icon && <i className={g.icon}></i>}
                {g.name}
                <span className="text-xs opacity-60">{g.memberCount}</span>
              </button>
            ))}
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Posts Feed */}
            <div className="lg:col-span-2 space-y-4">
              {/* Create Group Modal */}
              <AnimatePresence>
                {showCreateGroup && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xl space-y-4"
                  >
                    <h3 className="font-bold text-slate-800">Create a Group</h3>
                    <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Group name" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 outline-none text-sm" />
                    <input value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} placeholder="Description (optional)" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 outline-none text-sm" />
                    <div className="flex gap-2">
                      <button onClick={createGroup} className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-indigo-200/50">Create</button>
                      <button onClick={() => setShowCreateGroup(false)} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm">Cancel</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Post Form */}
              <AnimatePresence>
                {showPostForm && selectedGroup && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xl space-y-4"
                  >
                    <h3 className="font-bold text-slate-800">Share a Reflection</h3>
                    <textarea
                      value={postContent}
                      onChange={e => setPostContent(e.target.value)}
                      placeholder="What's on your mind?"
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 outline-none text-sm resize-none"
                    />

                    {/* Image preview */}
                    {postImagePreview && (
                      <div className="relative inline-block">
                        <img src={postImagePreview} className="max-h-40 rounded-xl border border-slate-100" alt="Preview" />
                        <button
                          onClick={removeImage}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] shadow-lg hover:scale-110 transition-transform"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-2 text-sm text-slate-400 hover:text-indigo-500 transition-colors font-medium"
                        >
                          <i className="fas fa-image"></i> Image
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                        <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer">
                          <input type="checkbox" checked={postAnonymous} onChange={e => setPostAnonymous(e.target.checked)} className="accent-indigo-500 rounded" />
                          Anonymous
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setShowPostForm(false); removeImage(); }} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm">Cancel</button>
                        <button
                          onClick={submitPost}
                          disabled={uploading || !postContent.trim()}
                          className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-indigo-200/50 disabled:opacity-50"
                        >
                          {uploading ? <i className="fas fa-spinner fa-spin mr-1"></i> : null}
                          Post
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Posts */}
              {posts.length === 0 ? (
                <motion.div variants={item} className="text-center py-16 text-slate-400">
                  <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-seedling text-2xl text-slate-300"></i>
                  </div>
                  <p className="font-semibold text-slate-500">No posts yet</p>
                  <p className="text-sm mt-1">Select a group and share your first reflection</p>
                </motion.div>
              ) : (
                posts.map((post, i) => (
                  <motion.article
                    key={post.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-lg hover:shadow-slate-100/50 transition-all duration-300 group"
                  >
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-indigo-200/30">
                            {post.author.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm">{post.author.displayName}</h3>
                            <p className="text-[10px] text-slate-400 font-semibold">{timeAgo(post.createdAt)} &middot; {post.group.name}</p>
                          </div>
                        </div>
                        {!post.isAnonymous && post.author.id !== user?.id && (
                          <button
                            onClick={() => navigate(`/community/dm/${post.author.id}`)}
                            className="text-xs text-slate-400 hover:text-indigo-500 font-semibold transition-colors px-3 py-1.5 rounded-lg hover:bg-indigo-50"
                          >
                            <i className="fas fa-envelope mr-1"></i> DM
                          </button>
                        )}
                      </div>

                      <p className="text-slate-600 leading-relaxed text-sm mb-4">{post.content}</p>

                      {post.imageUrl && (
                        <div className="rounded-xl overflow-hidden mb-4 border border-slate-50">
                          <img src={post.imageUrl} className="w-full max-h-96 object-cover group-hover:scale-[1.02] transition-transform duration-500" alt="" />
                        </div>
                      )}

                      <div className="flex items-center gap-4 pt-4 border-t border-slate-50">
                        <motion.button
                          whileTap={{ scale: 0.85 }}
                          onClick={() => toggleLike(post.id)}
                          className={`flex items-center gap-2 font-bold text-xs transition-colors ${post.isLiked ? 'text-red-500' : 'text-slate-400 hover:text-red-500'}`}
                        >
                          <i className={`${post.isLiked ? 'fas' : 'far'} fa-heart text-base`}></i> {post.likeCount}
                        </motion.button>
                      </div>
                    </div>
                  </motion.article>
                ))
              )}
            </div>

            {/* Sidebar */}
            <motion.aside variants={item} className="space-y-4">
              {/* Daily Wisdom */}
              <div className="bg-gradient-to-br from-indigo-500 via-purple-600 to-indigo-700 rounded-2xl p-6 text-white shadow-xl shadow-indigo-200/30 relative overflow-hidden">
                <div className="absolute top-2 right-2 w-20 h-20 rounded-full bg-white/10 blur-xl" />
                <h3 className="font-bold text-sm mb-2 relative">Daily Wisdom</h3>
                <p className="text-indigo-100 text-sm leading-relaxed italic relative">
                  "Healing is not linear. Some days will feel like a level up, others like a reset. Both are part of the journey."
                </p>
              </div>

              {/* My Groups */}
              {joinedGroups.length > 0 && (
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                  <h3 className="font-bold text-slate-800 uppercase tracking-widest text-[10px] mb-4">My Groups</h3>
                  <div className="space-y-2">
                    {joinedGroups.map(g => (
                      <div key={g.id} className="flex items-center justify-between py-1.5">
                        <button
                          onClick={() => navigate(`/community/group/${g.id}`)}
                          className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
                        >
                          {g.icon ? <i className={`${g.icon} text-slate-400 text-xs`}></i> : <div className="w-2 h-2 rounded-full bg-indigo-400" />}
                          {g.name}
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-bold">{g.memberCount}</span>
                          <button
                            onClick={() => navigate(`/community/group/${g.id}`)}
                            className="text-[10px] text-indigo-500 font-bold hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                          >
                            <i className="fas fa-comments"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Discover Groups */}
              {discoverGroups.length > 0 && (
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                  <h3 className="font-bold text-slate-800 uppercase tracking-widest text-[10px] mb-4">Discover</h3>
                  <div className="space-y-2">
                    {discoverGroups.map(g => (
                      <div key={g.id} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                          {g.icon ? <i className={`${g.icon} text-slate-300 text-xs`}></i> : <div className="w-2 h-2 rounded-full bg-slate-300" />}
                          {g.name}
                          <span className="text-[10px] text-slate-300">{g.memberCount}</span>
                        </div>
                        <button
                          onClick={() => joinGroup(g.id)}
                          className="text-xs text-indigo-500 font-bold hover:text-indigo-700 px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors"
                        >
                          Join
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.aside>
          </div>
        </>
      ) : (
        /* Messages Tab */
        <motion.div variants={item} className="space-y-3">
          {conversations.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-inbox text-2xl text-slate-300"></i>
              </div>
              <p className="font-semibold text-slate-500">No conversations yet</p>
              <p className="text-sm mt-1">Start a conversation by clicking DM on a post</p>
            </div>
          ) : (
            conversations.map((c, i) => (
              <motion.button
                key={c.user.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => navigate(`/community/dm/${c.user.id}`)}
                className="w-full bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-4 hover:shadow-lg hover:shadow-slate-100/50 hover:border-indigo-200 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-200/30">
                  {c.user.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-800 text-sm">{c.user.displayName}</h3>
                  {c.lastMessage && (
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {c.lastMessage.isFromMe && <span className="text-slate-300">You: </span>}
                      {c.lastMessage.content}
                    </p>
                  )}
                </div>
                {c.lastMessage && (
                  <span className="text-[10px] text-slate-300 font-semibold flex-shrink-0">
                    {timeAgo(c.lastMessage.createdAt)}
                  </span>
                )}
                <i className="fas fa-chevron-right text-slate-200 group-hover:text-indigo-400 transition-colors text-xs"></i>
              </motion.button>
            ))
          )}
        </motion.div>
      )}
    </motion.div>
  );
};

export default Community;
