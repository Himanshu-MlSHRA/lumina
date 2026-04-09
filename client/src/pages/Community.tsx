import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

const Community: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [groups, setGroups] = useState<Group[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [showPostForm, setShowPostForm] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postAnonymous, setPostAnonymous] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');

  const loadData = () => {
    api.get('/groups').then(d => setGroups(d.groups)).catch(console.error);
    const url = selectedGroup ? `/posts?groupId=${selectedGroup}` : '/posts';
    api.get(url).then(d => setPosts(d.posts)).catch(console.error);
  };

  useEffect(() => { loadData(); }, [selectedGroup]);

  const joinGroup = async (id: string) => {
    await api.post(`/groups/${id}/join`, {});
    loadData();
  };

  const toggleLike = async (postId: string) => {
    const res = await api.post(`/posts/${postId}/like`, {});
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, isLiked: res.liked, likeCount: res.count } : p));
  };

  const submitPost = async () => {
    if (!postContent.trim() || !selectedGroup) return;
    await api.post('/posts', { groupId: selectedGroup, content: postContent, isAnonymous: postAnonymous });
    setPostContent('');
    setShowPostForm(false);
    setPostAnonymous(false);
    loadData();
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

  return (
    <div className="space-y-8 pb-24 animate-in fade-in duration-500">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">The Circle</h1>
          <p className="text-slate-500">Shared moments of vulnerability and growth.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowCreateGroup(true)}
            className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <i className="fas fa-users"></i> New Group
          </button>
          {selectedGroup && (
            <button
              onClick={() => setShowPostForm(true)}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-indigo-200 hover:shadow-xl transition-all flex items-center gap-2 text-sm"
            >
              <i className="fas fa-plus"></i> Share Reflection
            </button>
          )}
        </div>
      </header>

      {/* Groups */}
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
        <button
          onClick={() => setSelectedGroup(null)}
          className={`flex-shrink-0 px-5 py-3 rounded-2xl font-semibold text-sm transition-all ${
            !selectedGroup
              ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200'
              : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
          }`}
        >
          All Posts
        </button>
        {groups.map(g => (
          <button
            key={g.id}
            onClick={() => setSelectedGroup(g.id)}
            className={`flex-shrink-0 px-5 py-3 rounded-2xl font-semibold text-sm transition-all flex items-center gap-2 ${
              selectedGroup === g.id
                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
            }`}
          >
            {g.icon && <i className={g.icon}></i>}
            {g.name}
            <span className="text-xs opacity-70">{g.memberCount}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Posts Feed */}
        <div className="lg:col-span-2 space-y-6">
          {/* Create Group Modal */}
          {showCreateGroup && (
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl space-y-4">
              <h3 className="font-bold text-slate-800">Create a Group</h3>
              <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Group name" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 outline-none text-sm" />
              <input value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} placeholder="Description (optional)" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 outline-none text-sm" />
              <div className="flex gap-3">
                <button onClick={createGroup} className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-indigo-200">Create</button>
                <button onClick={() => setShowCreateGroup(false)} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm">Cancel</button>
              </div>
            </div>
          )}

          {/* Post Form */}
          {showPostForm && selectedGroup && (
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl space-y-4">
              <h3 className="font-bold text-slate-800">Share a Reflection</h3>
              <textarea
                value={postContent}
                onChange={e => setPostContent(e.target.value)}
                placeholder="What's on your mind?"
                rows={4}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 outline-none text-sm resize-none"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer">
                  <input type="checkbox" checked={postAnonymous} onChange={e => setPostAnonymous(e.target.checked)} className="accent-indigo-500 rounded" />
                  Post anonymously
                </label>
                <div className="flex gap-3">
                  <button onClick={() => setShowPostForm(false)} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm">Cancel</button>
                  <button onClick={submitPost} className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-indigo-200">Post</button>
                </div>
              </div>
            </div>
          )}

          {/* Posts */}
          {posts.length === 0 && (
            <div className="text-center py-20 text-slate-400">
              <i className="fas fa-seedling text-5xl mb-4 opacity-30"></i>
              <p className="font-medium text-lg">No posts yet</p>
              <p className="text-sm">Select a group and share your first reflection</p>
            </div>
          )}

          {posts.map(post => (
            <article key={post.id} className="bg-white rounded-3xl border border-slate-100 overflow-hidden hover:shadow-xl hover:shadow-slate-100 transition-all duration-300 group">
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
                      {post.author.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{post.author.displayName}</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{timeAgo(post.createdAt)} &bull; {post.group.name}</p>
                    </div>
                  </div>
                  {!post.isAnonymous && post.author.id !== user?.id && (
                    <button
                      onClick={() => navigate(`/community/dm/${post.author.id}`)}
                      className="text-xs text-slate-400 hover:text-indigo-500 font-semibold transition-colors"
                    >
                      <i className="fas fa-envelope mr-1"></i> Message
                    </button>
                  )}
                </div>

                <p className="text-slate-600 leading-relaxed mb-6">{post.content}</p>

                {post.imageUrl && (
                  <div className="rounded-2xl overflow-hidden mb-6 border border-slate-50">
                    <img src={post.imageUrl} className="w-full aspect-[16/9] object-cover group-hover:scale-105 transition-transform duration-700" alt="" />
                  </div>
                )}

                <div className="flex items-center gap-6 pt-5 border-t border-slate-50">
                  <button
                    onClick={() => toggleLike(post.id)}
                    className={`flex items-center gap-2 font-bold text-xs transition-colors ${post.isLiked ? 'text-red-500' : 'text-slate-400 hover:text-red-500'}`}
                  >
                    <i className={`${post.isLiked ? 'fas' : 'far'} fa-heart text-lg`}></i> {post.likeCount}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-200">
            <h3 className="font-bold text-lg mb-3">Daily Wisdom</h3>
            <p className="text-indigo-100 text-sm leading-relaxed italic">
              "Healing is not linear. Some days will feel like a level up, others like a reset. Both are part of the journey."
            </p>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
            <h3 className="font-bold text-slate-800 uppercase tracking-widest text-[10px] mb-5">Groups</h3>
            <div className="space-y-3">
              {groups.map(g => (
                <div key={g.id} className="flex items-center justify-between">
                  <button
                    onClick={() => navigate(`/community/group/${g.id}`)}
                    className="flex items-center gap-3 text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
                  >
                    {g.icon && <i className={`${g.icon} text-slate-400`}></i>}
                    {g.name}
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-bold">{g.memberCount}</span>
                    {!g.isJoined && (
                      <button
                        onClick={() => joinGroup(g.id)}
                        className="text-[10px] text-indigo-500 font-bold hover:text-indigo-700"
                      >
                        Join
                      </button>
                    )}
                    {g.isJoined && (
                      <button
                        onClick={() => navigate(`/community/group/${g.id}`)}
                        className="text-[10px] text-indigo-500 font-bold"
                      >
                        <i className="fas fa-comments"></i>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Community;
