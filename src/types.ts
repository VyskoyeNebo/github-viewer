export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  language: string | null;
  updated_at: string;
  stargazers_count: number;
  fork: boolean;
}

export interface StoredCredential { accessToken: string; expiresAt?: number }
export interface DashboardData { user: GitHubUser; repositories: Repository[] }
