import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [leaderboard, setLeaderboard] = useState([])
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({})
  const [activeTab, setActiveTab] = useState('leaderboard') // 'leaderboard' or 'posts'
  const [selectedUser, setSelectedUser] = useState(null) // For viewing user posts
  const [userPosts, setUserPosts] = useState([])
  const [loadingUserPosts, setLoadingUserPosts] = useState(false)
  const [pollResults, setPollResults] = useState({}) // Cache poll results by post_uuid
  const [selectedPost, setSelectedPost] = useState(null) // For viewing post details
  const [postComments, setPostComments] = useState([])
  const [loadingPostDetails, setLoadingPostDetails] = useState(false)

  // API call function
  const apiCall = async (method, params = {}) => {
    try {
      const response = await fetch('https://api.twocents.money/prod', {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          "jsonrpc": "2.0",
          "id": "anon",
          "method": method,
          "params": params
        })
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error.message || 'API error')
      }
      
      return data.result
    } catch (error) {
      console.error(`API call failed for ${method}:`, error)
      throw error
    }
  }

  // Fetch poll results
  const fetchPollResults = async (postUuid) => {
    if (pollResults[postUuid]) {
      return pollResults[postUuid] // Return cached result
    }
    
    try {
      const result = await apiCall('/v1/polls/get', { post_uuid: postUuid })
      setPollResults(prev => ({ ...prev, [postUuid]: result }))
      return result
    } catch (error) {
      console.error('Failed to fetch poll results:', error)
      return null
    }
  }

  // Fetch user posts
  const fetchUserPosts = async (userUuid) => {
    setLoadingUserPosts(true)
    try {
      const result = await apiCall('/v1/users/get', { user_uuid: userUuid })
      setUserPosts(result.posts || [])
      setSelectedUser(result.user || null)
    } catch (error) {
      console.error('Failed to fetch user posts:', error)
      setUserPosts([])
      setSelectedUser(null)
    }
    setLoadingUserPosts(false)
  }

  // Fetch post details and comments
  const fetchPostDetails = async (postUuid) => {
    setLoadingPostDetails(true)
    try {
      // First try to get post details
      const postResult = await apiCall('/v1/posts/get', { post_uuid: postUuid })
      setSelectedPost(postResult.post || null)
      
      // Then try to get comments
      try {
        const commentsResult = await apiCall('/v1/comments/get', { post_uuid: postUuid })
        setPostComments(commentsResult.comments || [])
      } catch (commentsError) {
        console.warn('Failed to fetch comments:', commentsError)
        setPostComments([])
      }
    } catch (error) {
      console.error('Failed to fetch post details:', error)
      setSelectedPost(null)
      setPostComments([])
    }
    setLoadingPostDetails(false)
  }

  // Handle clicking on user pill
  const handleUserClick = (userUuid) => {
    fetchUserPosts(userUuid)
    setActiveTab('user-posts')
  }

  // Back to main posts
  const handleBackToPosts = () => {
    setSelectedUser(null)
    setUserPosts([])
    setActiveTab('posts')
  }

  // Handle clicking on a post to view details
  const handlePostClick = (postUuid) => {
    fetchPostDetails(postUuid)
    setActiveTab('post-detail')
  }

  // Back to posts from post detail
  const handleBackFromPostDetail = () => {
    setSelectedPost(null)
    setPostComments([])
    setActiveTab('posts')
  }

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const data = await apiCall('/v1/posts/arena', {
          filter: "topAllTime"
        })
        
        // Extract unique users from posts
        const userMap = new Map()
        
        data.posts.forEach(post => {
          const { author_uuid, author_meta } = post
          if (!userMap.has(author_uuid) && author_meta?.balance !== undefined) {
            userMap.set(author_uuid, {
              uuid: author_uuid,
              balance: author_meta.balance,
              age: author_meta.age,
              gender: author_meta.gender,
              arena: author_meta.arena,
              bio: author_meta.bio,
              subscription_type: author_meta.subscription_type
            })
          }
        })

        // Convert to array, sort by balance, and take top 100
        const allUsers = Array.from(userMap.values())
        const sortedUsers = allUsers
          .sort((a, b) => b.balance - a.balance)
          .slice(0, 100)
          .map((user, index) => ({ ...user, rank: index + 1 }))

        // Calculate stats
        const totalUsers = allUsers.length
        const totalNetWorth = allUsers.reduce((sum, user) => sum + user.balance, 0)
        const averageNetWorth = totalNetWorth / totalUsers
        const millionaires = allUsers.filter(user => user.balance >= 1000000).length

        setStats({
          totalUsers,
          totalNetWorth,
          averageNetWorth,
          millionaires,
          topBalance: sortedUsers[0]?.balance || 0
        })

        setLeaderboard(sortedUsers)
        setPosts(data.posts)
      } catch (error) {
        console.error('Error loading initial data:', error)
        // Set empty data to prevent crashes
        setLeaderboard([])
        setPosts([])
        setStats({
          totalUsers: 0,
          totalNetWorth: 0,
          averageNetWorth: 0,
          millionaires: 0,
          topBalance: 0
        })
      }
      setLoading(false)
    }

    loadInitialData()
  }, [])

  const getNetWorthTier = (balance) => {
    if (balance >= 1000000) return { tier: 'gold', label: 'Gold' }
    if (balance >= 100000) return { tier: 'silver', label: 'Silver' }
    if (balance >= 10000) return { tier: 'bronze', label: 'Bronze' }
    return { tier: 'basic', label: 'Basic' }
  }

  const formatBalance = (balance) => {
    if (balance >= 1000000) {
      return `$${(balance / 1000000).toFixed(1)}M`
    } else if (balance >= 1000) {
      return `$${(balance / 1000).toFixed(1)}K`
    } else {
      return `$${balance.toFixed(0)}`
    }
  }


  const getRankStyle = (rank) => {
    if (rank === 1) return 'text-yellow-600'
    if (rank === 2) return 'text-gray-500'
    if (rank === 3) return 'text-orange-600'
    if (rank <= 10) return 'text-blue-600'
    return 'text-gray-600'
  }

  const getRankEmoji = (rank) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return ''
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    })
  }

  // Comment Component with nesting support
  const CommentComponent = ({ comment, depth = 0 }) => {
    const tierInfo = getNetWorthTier(comment.author_meta?.balance || 0)
    const maxDepth = 3 // Limit nesting to prevent excessive indentation
    const indentSize = Math.min(depth, maxDepth) * 20
    
    return (
      <div 
        className="border-l-2 border-gray-300 bg-gray-50 rounded-r-lg"
        style={{ marginLeft: `${indentSize}px` }}
      >
        <div className="p-3">
          {/* Comment Author Info */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleUserClick(comment.author_uuid)}
                className={`tier-${tierInfo.tier} px-2 py-1 rounded-full text-xs font-bold hover:opacity-80 transition-opacity cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                title="Click to view user's posts"
              >
                {formatBalance(comment.author_meta?.balance || 0)}
              </button>
              
              <div className="flex items-center space-x-1 text-xs text-gray-600">
                <span>{comment.author_meta?.age || '?'}y</span>
                <span>•</span>
                <span>{comment.author_meta?.gender || '?'}</span>
                {comment.author_meta?.arena && (
                  <>
                    <span>•</span>
                    <span className="truncate max-w-20">{comment.author_meta.arena}</span>
                  </>
                )}
              </div>
            </div>
            
            <div className="text-xs text-gray-500">
              {formatDate(comment.created_at)}
            </div>
          </div>

          {/* Comment Content */}
          {comment.text && (
            <p className="text-gray-700 text-sm mb-2 whitespace-pre-wrap">{comment.text}</p>
          )}

          {/* Comment Engagement */}
          <div className="flex items-center space-x-3 text-xs text-gray-500">
            <span>👍 {comment.upvote_count || 0}</span>
            <span>💬 {comment.reply_count || 0}</span>
          </div>

          {/* Nested Comments */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-3 space-y-2">
              {comment.replies.map((reply) => (
                <CommentComponent 
                  key={reply.uuid} 
                  comment={reply} 
                  depth={depth + 1} 
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Animated Poll Component
  const PollComponent = ({ post }) => {
    const [pollData, setPollData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [animatedValues, setAnimatedValues] = useState({})

    useEffect(() => {
      const loadPollData = async () => {
        try {
          const data = await fetchPollResults(post.uuid)
          if (data) {
            setPollData(data)
            // Start animation after data loads
            setTimeout(() => {
              const animated = {}
              data.options?.forEach((option, index) => {
                animated[index] = option.percentage || 0
              })
              setAnimatedValues(animated)
            }, 100)
          }
        } catch (error) {
          console.error('Error loading poll:', error)
        }
        setLoading(false)
      }

      loadPollData()
    }, [post.uuid])

    // Animate percentage values
    useEffect(() => {
      if (!pollData?.options) return

      const timeouts = []
      pollData.options.forEach((option, index) => {
        const targetValue = option.percentage || 0
        let currentValue = 0
        const increment = targetValue / 30 // 30 steps for smooth animation
        
        const animate = () => {
          if (currentValue < targetValue) {
            currentValue = Math.min(currentValue + increment, targetValue)
            setAnimatedValues(prev => ({ ...prev, [index]: currentValue }))
            timeouts.push(setTimeout(animate, 16)) // ~60fps
          }
        }
        
        setTimeout(animate, index * 100) // Stagger animations
      })

      return () => timeouts.forEach(clearTimeout)
    }, [pollData])

    if (loading) {
      return (
        <div className="bg-gray-100 rounded-lg p-4 animate-pulse">
          <div className="h-4 bg-gray-300 rounded mb-2"></div>
          <div className="h-4 bg-gray-300 rounded w-3/4"></div>
        </div>
      )
    }

    if (!pollData) {
      return (
        <div className="bg-gray-100 rounded-lg p-4 text-center text-gray-600">
          <p>Poll results unavailable</p>
        </div>
      )
    }

    return (
      <div className="bg-gray-100 rounded-lg p-4 space-y-3">
        <h4 className="font-semibold text-gray-900 mb-3">Poll Results</h4>
        {pollData.options?.map((option, index) => {
          const animatedPercentage = animatedValues[index] || 0
          return (
            <div key={index} className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700">{option.text}</span>
                <span className="text-sm font-medium text-gray-900">
                  {Math.round(animatedPercentage)}%
                </span>
              </div>
              <div className="w-full bg-gray-300 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${animatedPercentage}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-600">
                {option.vote_count || 0} votes
              </div>
            </div>
          )
        })}
        {pollData.total_votes && (
          <div className="pt-2 border-t border-gray-300 text-xs text-gray-600">
            Total votes: {pollData.total_votes}
          </div>
        )}
      </div>
    )
  }

  const PostComponent = ({ post, isDetailView = false }) => {
    const tierInfo = getNetWorthTier(post.author_meta?.balance || 0)
    
    // Error handling for unsupported post types
    if (!post.text && !post.title && !post.poll) {
      return (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 border-l-4 border-l-yellow-500">
          <div className="flex items-center space-x-2 text-yellow-600">
            <span>⚠️</span>
            <span className="text-sm font-medium">Unsupported post type</span>
          </div>
          <p className="text-gray-600 text-sm mt-1">This post type is not currently supported.</p>
        </div>
      )
    }
    
    return (
      <div 
        className={`relative bg-white border border-gray-200 rounded-lg p-4 transition-colors shadow-sm ${
          isDetailView 
            ? '' 
            : 'hover:bg-gray-50 cursor-pointer group hover:shadow-md'
        }`}
        onClick={isDetailView ? undefined : () => handlePostClick(post.uuid)}
      >
        {/* Click to view post hint - only show when not in detail view */}
        {!isDetailView && (
          <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded pointer-events-none z-10">
            Click to view comments
          </div>
        )}
        
        {/* Author Info */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <button
              onClick={(e) => {
                if (!isDetailView) e.stopPropagation()
                handleUserClick(post.author_uuid)
              }}
              className={`tier-${tierInfo.tier} px-3 py-1 rounded-full text-sm font-bold hover:opacity-80 transition-opacity cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500`}
              title="Click to view user's posts"
            >
              {formatBalance(post.author_meta?.balance || 0)}
            </button>
            
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <span>{post.author_meta?.age || '?'}y</span>
              <span>•</span>
              <span>{post.author_meta?.gender || '?'}</span>
              {post.author_meta?.arena && (
                <>
                  <span>•</span>
                  <span className="truncate max-w-32">{post.author_meta.arena}</span>
                </>
              )}
            </div>

         
          </div>
          
          <div className="text-xs text-gray-500">
            {formatDate(post.created_at)}
          </div>
        </div>

        {/* Post Content */}
        {post.title && (
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{post.title}</h3>
        )}
        
        {post.text && (
          <p className="text-gray-700 mb-3 whitespace-pre-wrap">{post.text}</p>
        )}

        {/* Poll Component for poll posts */}
        {post.poll && (
          <div className="mb-3">
            <PollComponent post={post} />
          </div>
        )}

        {/* Topic and Engagement */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {post.topic && (
              <span className="bg-gray-100 text-blue-600 px-2 py-1 rounded text-xs">
                #{post.topic}
              </span>
            )}
            
            <div className="flex items-center space-x-3 text-xs text-gray-500">
              <span>👍 {post.upvote_count || 0}</span>
              <span>💬 {post.comment_count || 0}</span>
              <span>👁 {post.view_count || 0}</span>
            </div>
          </div>
          
          <div className={`tier-${tierInfo.tier} px-2 py-1 rounded text-xs font-bold`}>
            {tierInfo.label}
          </div>
        </div>

        {/* Bio */}
        {post.author_meta?.bio && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-600 italic">{post.author_meta.bio}</p>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl mb-4">Loading leaderboard...</div>
          <div className="animate-pulse text-gray-600">Calculating net worth rankings...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50  backdrop-blur-xl border-b border-gray-200 shadow-lg">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between py-4">
            {/* Brand Section */}
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-3">
                <img 
                  src="/square-logo.webp" 
                  alt="TwoCents Logo" 
                  className="w-8 h-8 md:w-10 md:h-10"
                />
                <div>
                  <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
                    Two<span className="text-emerald-600">Cents</span>
                  </h1>
                  <p className="text-gray-600 text-xs font-medium hidden md:block">
                    Financial Social Platform
                  </p>
                </div>
              </div>
              
              {/* Page Title - Moved up */}
              <div className="hidden lg:block">
                <h2 className="text-lg font-semibold text-gray-900">
                  {activeTab === 'leaderboard' ? 'Wealth Leaderboard' : 
                   activeTab === 'posts' ? 'Community Insights' : 
                   activeTab === 'post-detail' ? 'Post Discussion' :
                   'User Posts'}
                </h2>
                <p className="text-gray-600 text-xs">
                  {activeTab === 'leaderboard' 
                    ? 'Top 100 verified net worth rankings'
                    : activeTab === 'posts'
                    ? 'Popular discussions from verified members'
                    : activeTab === 'post-detail'
                    ? 'View post and all replies'
                    : `Posts by ${selectedUser?.username || 'user'}`
                  }
                </p>
              </div>
            </div>

            {/* Right Side - Navigation + Metrics */}
            <div className="flex items-center space-x-4 md:space-x-6">
              {/* Key Metrics - Moved up */}
              <div className="hidden md:flex items-center space-x-3">
                <div className="flex items-center space-x-2 bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-gray-700 font-medium">
                    {stats.totalUsers} Members
                  </span>
                </div>
                <div className="hidden lg:flex items-center space-x-2 bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-gray-700 font-medium">
                    {formatBalance(stats.totalNetWorth)} Total
                  </span>
                </div>
              </div>
              
              {/* Navigation Tabs */}
              <nav className="flex items-center">
                {activeTab === 'user-posts' ? (
                  <button
                    onClick={handleBackToPosts}
                    className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl px-4 py-2 text-gray-700 hover:text-gray-900 transition-all duration-200"
                  >
                    <span>←</span>
                    <span className="text-sm cursor-pointer font-medium">Back to Posts</span>
                  </button>
                ) : activeTab === 'post-detail' ? (
                  <button
                    onClick={handleBackFromPostDetail}
                    className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl px-4 py-2 text-gray-700 hover:text-gray-900 transition-all duration-200"
                  >
                    <span>←</span>
                    <span className="text-sm cursor-pointer font-medium">Back to Posts</span>
                  </button>
                ) : (
                  <div className="flex bg-gray-100 rounded-xl p-1 border border-gray-200">
                    <button
                      onClick={() => setActiveTab('leaderboard')}
                      className={`px-3 cursor-pointer md:px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm ${
                        activeTab === 'leaderboard'
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                      }`}
                    >
                      Leaderboard
                    </button>
                    <button
                      onClick={() => setActiveTab('posts')}
                      className={`px-3 cursor-pointer md:px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm ${
                        activeTab === 'posts'
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                      }`}
                    >
                      Top Posts
                    </button>
                  </div>
                )}
              </nav>
            </div>
          </div>
        </div>
      </header>

      {activeTab === 'leaderboard' && (
        <div>
          {/* Stats */}
          <section className="max-w-5xl mx-auto p-4 md:p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white border border-gray-200 rounded-lg p-4 text-center shadow-sm">
                <div className="text-2xl font-bold text-green-600">{stats.totalUsers}</div>
                <div className="text-sm text-gray-600">Total Users</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4 text-center shadow-sm">
                <div className="text-2xl font-bold text-blue-600">{stats.millionaires}</div>
                <div className="text-sm text-gray-600">Millionaires</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4 text-center shadow-sm">
                <div className="text-xl md:text-2xl font-bold text-purple-600">{formatBalance(stats.averageNetWorth)}</div>
                <div className="text-sm text-gray-600">Avg Net Worth</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4 text-center shadow-sm">
                <div className="text-xl md:text-2xl font-bold text-yellow-600">{formatBalance(stats.topBalance)}</div>
                <div className="text-sm text-gray-600">Top Balance</div>
              </div>
            </div>
          </section>

          {/* Leaderboard */}
          <main className="max-w-5xl mx-auto p-4 md:p-6">
            <div className="space-y-2">
              {leaderboard.map((user) => {
                const tierInfo = getNetWorthTier(user.balance)
                return (
                  <div
                    key={user.uuid}
                    className="bg-white border border-gray-200 rounded-lg p-3 md:p-4 hover:bg-gray-50 transition-colors shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 md:space-x-4 flex-1 min-w-0">
                        {/* Rank */}
                        <div className={`text-xl md:text-2xl font-bold w-8 md:w-12 text-center ${getRankStyle(user.rank)}`}>
                          <span className="mr-1">{getRankEmoji(user.rank)}</span>
                          #{user.rank}
                        </div>
                        
                        {/* User Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 md:space-x-3">
                            <button
                              onClick={() => handleUserClick(user.uuid)}
                              className={`tier-${tierInfo.tier} px-3 py-1 rounded-full text-sm md:text-base font-bold hover:opacity-80 transition-opacity cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                              title="Click to view user's posts"
                            >
                              {formatBalance(user.balance)}
                            </button>
                            
                            <div className={`tier-${tierInfo.tier} px-2 py-1 rounded text-xs font-bold`}>
                              {tierInfo.label}
                            </div>
                         
                          </div>
                          
                          <div className="flex items-center space-x-2 md:space-x-4 text-xs md:text-sm text-gray-600 mt-1">
                            <span>{user.age}y</span>
                            <span>{user.gender}</span>
                            {user.arena && <span className="truncate">{user.arena}</span>}
                          </div>
                          
                          {user.bio && (
                            <p className="text-xs md:text-sm text-gray-700 mt-2 line-clamp-2">
                              {user.bio}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      {/* Net Worth (Large) - Hidden on mobile */}
                      <div className="text-right hidden md:block">
                        <div className="text-xl md:text-2xl font-bold">
                          {user.balance.toLocaleString('en-US', {
                            style: 'currency',
                            currency: 'USD',
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </main>
        </div>
      )}

      {activeTab === 'posts' && (
        <main className="max-w-5xl mx-auto p-4 md:p-6">
          <div className="space-y-4">
            {posts.map((post) => (
              <PostComponent key={post.uuid} post={post} />
            ))}
          </div>
        </main>
      )}

      {activeTab === 'user-posts' && (
        <main className="max-w-5xl mx-auto p-4 md:p-6">
          {selectedUser && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className={`tier-${getNetWorthTier(selectedUser.balance || 0).tier} px-4 py-2 rounded-full text-lg font-bold`}>
                    {formatBalance(selectedUser.balance || 0)}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      {selectedUser.username || 'Anonymous User'}
                    </h3>
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <span>{selectedUser.age || '?'}y</span>
                      <span>•</span>
                      <span>{selectedUser.gender || '?'}</span>
                      {selectedUser.arena && (
                        <>
                          <span>•</span>
                          <span>{selectedUser.arena}</span>
                        </>
                      )}
                    </div>
                    {selectedUser.bio && (
                      <p className="text-gray-700 mt-2">{selectedUser.bio}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleBackToPosts}
                  className="text-gray-600 hover:text-gray-900 transition-colors px-3 py-1 rounded"
                >
                  ← Back
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {loadingUserPosts ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse shadow-sm">
                    <div className="h-4 bg-gray-300 rounded mb-2"></div>
                    <div className="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
                    <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : userPosts.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-8 text-center shadow-sm">
                <div className="text-gray-600 mb-2">📭</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No posts found</h3>
                <p className="text-gray-600">This user hasn't posted anything yet.</p>
              </div>
            ) : (
              userPosts.map((post) => (
                <PostComponent key={post.uuid} post={post} />
              ))
            )}
          </div>
        </main>
      )}

      {activeTab === 'post-detail' && (
        <main className="max-w-5xl mx-auto p-4 md:p-6">
          {loadingPostDetails ? (
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse shadow-sm">
                <div className="h-6 bg-gray-300 rounded mb-3"></div>
                <div className="h-4 bg-gray-300 rounded mb-2"></div>
                <div className="h-4 bg-gray-300 rounded w-3/4"></div>
              </div>
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse ml-4 shadow-sm">
                  <div className="h-3 bg-gray-300 rounded mb-2"></div>
                  <div className="h-3 bg-gray-300 rounded w-2/3"></div>
                </div>
              ))}
            </div>
          ) : selectedPost ? (
            <div className="space-y-6">
              {/* Main Post */}
              <div className="bg-white border border-gray-200 rounded-lg p-6 border-l-4 border-l-emerald-500 shadow-sm">
                <PostComponent post={selectedPost} isDetailView={true} />
              </div>

              {/* Comments Section */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Comments ({postComments.length})
                  </h3>
                  <div className="text-sm text-gray-600">
                    Sorted by engagement
                  </div>
                </div>

                {postComments.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-gray-600 mb-2">💬</div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-2">No comments yet</h4>
                    <p className="text-gray-600">Be the first to share your thoughts!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {postComments.map((comment) => (
                      <CommentComponent key={comment.uuid} comment={comment} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center shadow-sm">
              <div className="text-gray-600 mb-2">❌</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Post not found</h3>
              <p className="text-gray-600">This post may have been deleted or doesn't exist.</p>
              <button
                onClick={handleBackFromPostDetail}
                className="mt-4 cursor-pointer px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
              > 
                Back to Posts
              </button>
            </div>
          )}
        </main>
      )}

      {/* Footer */}
      <footer className="mt-12 text-center text-gray-500 text-sm p-4">
        <p>Anonymous • Verified • Leaderboards</p>
        <p className="mt-2">Connect brokerages, bank accounts and crypto wallets to sum up your net worth</p>
        <p className="mt-1 text-gray-600">Data from twocents app</p>
      </footer>
    </div>
  )
}

export default App
