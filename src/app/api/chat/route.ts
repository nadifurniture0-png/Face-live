/**
 * Chat API Route
 * GET  /api/chat?roomId=xxx  — Get messages for a room
 * POST /api/chat             — Send a message to a room
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET — Fetch chat messages for a room
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get('roomId');

    if (!roomId) {
      return NextResponse.json({ error: 'roomId required' }, { status: 400 });
    }

    const messages = await db.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
      take: 100, // last 100 messages
    });

    const mapped = messages.map((m) => ({
      id: m.id,
      roomId: m.roomId,
      userId: m.userId,
      userName: m.userName,
      userAvatar: m.userAvatar,
      message: m.message,
      type: m.type,
      createdAt: m.createdAt.toISOString(),
    }));

    return NextResponse.json(mapped);
  } catch (error) {
    console.error('Fetch chat error:', error);
    return NextResponse.json([], { status: 200 });
  }
}

// POST — Send a chat message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { roomId, userId, userName, userAvatar, message, type } = body;

    if (!roomId || !userId || !message) {
      return NextResponse.json(
        { error: 'roomId, userId, and message are required' },
        { status: 400 }
      );
    }

    const chatMessage = await db.chatMessage.create({
      data: {
        roomId,
        userId,
        userName: userName || 'Anonymous',
        userAvatar: userAvatar || null,
        message,
        type: type || 'text',
      },
    });

    return NextResponse.json({
      id: chatMessage.id,
      roomId: chatMessage.roomId,
      userId: chatMessage.userId,
      userName: chatMessage.userName,
      userAvatar: chatMessage.userAvatar,
      message: chatMessage.message,
      type: chatMessage.type,
      createdAt: chatMessage.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Send chat error:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
