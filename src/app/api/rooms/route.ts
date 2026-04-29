/**
 * Rooms API Route
 * GET  /api/rooms     — List all live rooms
 * POST /api/rooms     — Create a new live room
 * PATCH /api/rooms    — Update a room (e.g., isLive status)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET — List all live rooms
export async function GET() {
  try {
    const rooms = await db.liveRoom.findMany({
      where: { isLive: true },
      include: { host: true },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = rooms.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      hostId: r.hostId,
      hostName: r.host.name,
      hostAvatar: r.host.avatar,
      channelId: r.channelId,
      isLive: r.isLive,
      viewerCount: r.viewerCount,
      tags: r.tags,
      thumbnail: r.thumbnail,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return NextResponse.json(mapped);
  } catch (error) {
    console.error('Fetch rooms error:', error);
    return NextResponse.json([], { status: 200 });
  }
}

// POST — Create a new live room
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, hostId, tags } = body;

    if (!title || !hostId) {
      return NextResponse.json(
        { error: 'Title and hostId are required' },
        { status: 400 }
      );
    }

    const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const channelId = `channel_${roomId}`;

    const room = await db.liveRoom.create({
      data: {
        id: roomId,
        title,
        description: description || null,
        hostId,
        channelId,
        tags: tags || null,
        isLive: true,
        viewerCount: 0,
      },
      include: { host: true },
    });

    // Add a system message
    await db.chatMessage.create({
      data: {
        roomId: room.id,
        userId: hostId,
        userName: 'System',
        message: `${room.host.name} started live streaming`,
        type: 'system',
      },
    });

    return NextResponse.json({
      id: room.id,
      title: room.title,
      description: room.description,
      hostId: room.hostId,
      hostName: room.host.name,
      hostAvatar: room.host.avatar,
      channelId: room.channelId,
      isLive: room.isLive,
      viewerCount: room.viewerCount,
      tags: room.tags,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Create room error:', error);
    return NextResponse.json(
      { error: 'Failed to create room' },
      { status: 500 }
    );
  }
}

// PATCH — Update a room
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { roomId, isLive } = body;

    if (!roomId) {
      return NextResponse.json({ error: 'Room ID required' }, { status: 400 });
    }

    const room = await db.liveRoom.update({
      where: { id: roomId },
      data: { isLive: isLive !== undefined ? isLive : undefined },
    });

    return NextResponse.json({ success: true, room });
  } catch (error) {
    console.error('Update room error:', error);
    return NextResponse.json(
      { error: 'Failed to update room' },
      { status: 500 }
    );
  }
}
