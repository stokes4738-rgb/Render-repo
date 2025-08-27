-- PostgreSQL schema for PocketBounty
-- This file is for reference and initial setup only
-- The app uses Drizzle ORM for actual database operations

create extension if not exists "uuid-ossp";

create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  username text unique not null,
  email text unique not null,
  password text not null,
  first_name text,
  last_name text,
  handle text unique,
  points integer default 0,
  balance decimal(10,2) default 0.00,
  lifetime_earned decimal(10,2) default 0.00,
  level integer default 1,
  rating decimal(3,2),
  review_count integer default 0,
  profile_image_url text,
  bio text,
  stripe_customer_id text,
  stripe_connect_account_id text,
  stripe_connect_status text,
  referral_code text unique,
  referral_count integer default 0,
  referred_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists bounties (
  id uuid primary key default uuid_generate_v4(),
  author_id uuid references users(id) on delete cascade,
  title text not null,
  description text,
  reward decimal(10,2) not null,
  category text,
  difficulty text,
  duration text,
  status text check (status in ('open','in_progress','completed','expired','canceled')) default 'open',
  assigned_to uuid references users(id),
  completed_by uuid references users(id),
  proof_of_completion text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz
);

create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null,
  sender_id uuid references users(id) on delete cascade,
  recipient_id uuid references users(id) on delete cascade,
  content text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);

create table if not exists transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  type text check (type in ('deposit','withdrawal','payment','refund','reward','purchase')) not null,
  amount decimal(10,2) not null,
  description text,
  status text check (status in ('pending','completed','failed','canceled')) default 'pending',
  stripe_payment_intent_id text,
  created_at timestamptz default now()
);

create table if not exists reviews (
  id uuid primary key default uuid_generate_v4(),
  reviewer_id uuid references users(id) on delete cascade,
  reviewed_id uuid references users(id) on delete cascade,
  bounty_id uuid references bounties(id) on delete cascade,
  rating integer check (rating >= 1 and rating <= 5) not null,
  comment text,
  created_at timestamptz default now()
);

create table if not exists activities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  type text not null,
  description text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

create table if not exists friendships (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  friend_id uuid references users(id) on delete cascade,
  status text check (status in ('pending','accepted','declined','blocked')) default 'pending',
  created_at timestamptz default now(),
  unique(user_id, friend_id)
);

-- Indexes for performance
create index if not exists idx_bounties_status on bounties(status);
create index if not exists idx_bounties_author on bounties(author_id);
create index if not exists idx_messages_thread on messages(thread_id);
create index if not exists idx_messages_recipient on messages(recipient_id);
create index if not exists idx_transactions_user on transactions(user_id);
create index if not exists idx_activities_user on activities(user_id);
create index if not exists idx_friendships_user on friendships(user_id);
create index if not exists idx_friendships_friend on friendships(friend_id);