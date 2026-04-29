'use client';

/**
 * LoginScreen Component
 * ──────────────────────
 * Mock Firebase Auth login screen.
 * Allows users to enter their name/email to join the platform.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Radio,
  LogIn,
  Eye,
  Sparkles,
  Shield,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useStreamStore } from '@/store/stream-store';

export function LoginScreen() {
  const { login, isLoading } = useAuthStore();
  const { setView } = useStreamStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }

    try {
      await login({ email: email.trim(), name: name.trim() });
    } catch {
      setError('Login failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-black via-zinc-950 to-black">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-600/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-red-600 mb-4 shadow-2xl shadow-purple-600/20"
          >
            <Radio className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Stream<span className="text-purple-500">Live</span>
          </h1>
          <p className="text-zinc-500 text-sm mt-2">
            Live streaming with real-time face swap filters
          </p>
        </div>

        {/* Login card */}
        <Card className="bg-zinc-900/80 border-zinc-800/50 backdrop-blur-xl shadow-2xl">
          <CardHeader className="pb-2">
            <h2 className="text-lg font-semibold text-white text-center">
              Join the Stream
            </h2>
            <p className="text-xs text-zinc-500 text-center">
              Enter your details to start watching or broadcasting
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-zinc-400 text-sm">
                  Display Name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-600 focus:border-purple-500/50 focus:ring-purple-500/20 h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-400 text-sm">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-600 focus:border-purple-500/50 focus:ring-purple-500/20 h-11"
                />
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-400 text-sm text-center"
                >
                  {error}
                </motion.p>
              )}

              <Button
                type="submit"
                disabled={isLoading || !name.trim() || !email.trim()}
                className="w-full bg-gradient-to-r from-purple-600 to-red-600 hover:from-purple-700 hover:to-red-700 text-white h-11 font-semibold shadow-lg shadow-purple-600/20"
              >
                {isLoading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1 }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                  />
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Enter StreamLive
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Features */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          {[
            { icon: Eye, label: 'Watch Live', color: 'text-cyan-400' },
            { icon: Sparkles, label: 'Face Filters', color: 'text-purple-400' },
            { icon: Shield, label: 'Real-time', color: 'text-green-400' },
          ].map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1.5 text-center"
            >
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-[10px] text-zinc-500">{label}</span>
            </div>
          ))}
        </div>

        {/* Demo hint */}
        <p className="text-center text-[10px] text-zinc-700 mt-6">
          Demo mode — No real Firebase/Agora credentials required
        </p>
      </motion.div>
    </div>
  );
}
