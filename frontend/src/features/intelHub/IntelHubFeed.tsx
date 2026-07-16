import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, MapPin, Star, CheckCircle2, XCircle, Clock, Trophy } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useAuthStore } from '../../store/authStore';
import { useSocketEvent } from '../../hooks/useSocket';
import {
  listIntelPosts,
  verifyIntelPost,
  rejectIntelPost,
  getIntelHubLeaderboard,
  markIntelHubViewed,
} from '../../api/intelHubApi';
import type { IntelPost, IntelHubAuthor, IntelPostType } from '../../types';

const TYPE_LABEL: Record<IntelPostType, string> = {
  new_supplier: 'New Supplier',
  cheaper_supplier: 'Cheaper Supplier',
  better_quality: 'Better Quality',
  faster_delivery: 'Faster Delivery',
  bulk_discount: 'Bulk Discount',
  local_supplier: 'Local Supplier',
  alternative_material: 'Alternative Material',
  excess_stock: 'Excess Stock',
};

const STATUS_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'default' }> = {
  pending: { label: 'Pending Review', variant: 'warning' },
  verified: { label: 'Verified', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  expired: { label: 'Expired', variant: 'default' },
};

export function IntelHubFeed() {
  const [posts, setPosts] = useState<IntelPost[]>([]);
  const [leaderboard, setLeaderboard] = useState<IntelHubAuthor[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [processingId, setProcessingId] = useState<number | null>(null);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const refresh = () =>
    listIntelPosts({ search: search || undefined, postType: typeFilter || undefined, status: statusFilter || undefined })
      .then(setPosts)
      .catch((e) => setError(e.message));

  useEffect(() => {
    const debounce = setTimeout(refresh, 250);
    return () => clearTimeout(debounce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, statusFilter]);

  useEffect(() => {
    getIntelHubLeaderboard().then(setLeaderboard).catch(console.error);
    // Opening the feed is what clears the sidebar's red dot — same pattern
    // as the unread count being computed from "posts created since I last opened this."
    markIntelHubViewed().catch(console.error);
  }, []);

  useSocketEvent('intel:post_created', refresh);
  useSocketEvent('intel:post_verified', () => {
    refresh();
    getIntelHubLeaderboard().then(setLeaderboard).catch(console.error);
  });

  const handleVerify = async (id: number) => {
    setProcessingId(id);
    try {
      await verifyIntelPost(id, 5);
      refresh();
      getIntelHubLeaderboard().then(setLeaderboard).catch(console.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not verify post');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: number) => {
    setProcessingId(id);
    try {
      await rejectIntelPost(id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reject post');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">IntelHub</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Procurement intelligence — new suppliers, better prices, and material leads, shared across the org.
          </p>
        </div>
        <Button onClick={() => navigate('/intel-hub/new')} className="gap-2">
          <Plus className="w-4 h-4" /> Share a Lead
        </Button>
      </div>

      {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 rounded-lg">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-4">
          {/* Search + filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search material, supplier, location..."
                className="input pl-9"
              />
            </div>
            <select className="input w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All Types</option>
              {Object.entries(TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="pending">Pending Review</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          {/* Feed */}
          <div className="space-y-3">
            {posts.length === 0 && (
              <Card className="p-8 text-center text-muted-foreground text-sm">No leads match these filters yet.</Card>
            )}
            {posts.map((post) => {
              const statusInfo = STATUS_BADGE[post.displayStatus];
              return (
                <Card key={post.id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <Badge variant="info" className="text-[10px] uppercase">{TYPE_LABEL[post.postType]}</Badge>
                        <Badge variant={statusInfo.variant} className="text-[10px] uppercase gap-1">
                          {post.displayStatus === 'verified' && <CheckCircle2 className="w-3 h-3" />}
                          {post.displayStatus === 'rejected' && <XCircle className="w-3 h-3" />}
                          {post.displayStatus === 'pending' && <Clock className="w-3 h-3" />}
                          {statusInfo.label}
                        </Badge>
                      </div>
                      <h3 className="font-semibold text-foreground">{post.title}</h3>
                      <p className="text-sm text-foreground/70 mt-1">{post.description}</p>
                      <div className="flex items-center gap-4 flex-wrap mt-3 text-xs text-muted-foreground">
                        <span><strong className="text-foreground/80">{post.materialName}</strong> from {post.supplierName}</span>
                        {post.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {post.location}</span>}
                        {post.price != null && <span>₹{Number(post.price).toFixed(2)}/unit</span>}
                        {post.quantity != null && <span>Qty {post.quantity}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                        <span>by {post.createdBy?.name ?? 'Unknown'}</span>
                        {post.createdBy && post.createdBy.intelStars > 0 && (
                          <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                            <Star className="w-3 h-3 fill-current" /> {post.createdBy.intelStars}
                          </span>
                        )}
                        <span>· {new Date(post.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                      </div>
                    </div>

                    {user?.isAdmin && post.status === 'pending' && (
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button size="sm" onClick={() => handleVerify(post.id)} className="gap-1.5" loading={processingId === post.id}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Verify
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600 gap-1.5" onClick={() => handleReject(post.id)} loading={processingId === post.id}>
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Leaderboard */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" /> Top Contributors
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground">No verified leads yet — be the first.</p>
            ) : (
              leaderboard.map((u, i) => (
                <div key={u.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                    <span className="text-foreground">{u.name}</span>
                  </span>
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                    <Star className="w-3.5 h-3.5 fill-current" /> {u.intelStars}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
