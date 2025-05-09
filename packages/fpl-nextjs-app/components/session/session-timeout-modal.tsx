'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@/providers/session-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const SESSION_TIMEOUT_WARNING = 25 * 60 * 1000; // 25 minutes in milliseconds
const SESSION_ACTIVITY_CHECK = 5 * 60 * 1000; // Check activity every 5 minutes

export function SessionTimeoutModal() {
  const { session, refreshSession, signOut } = useSession();
  const [showTimeout, setShowTimeout] = useState(false);
  const [countdown, setCountdown] = useState(5 * 60); // 5 minute countdown
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);
  const [activityTimer, setActivityTimer] = useState<NodeJS.Timeout | null>(null);
  const [lastActivity, setLastActivity] = useState(Date.now());

  // Track user activity
  const updateActivity = () => {
    setLastActivity(Date.now());
    if (showTimeout) {
      // User is active, so refresh session and hide warning
      handleKeepSession();
    }
  };

  // Set up activity tracking
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    events.forEach(event => {
      window.addEventListener(event, updateActivity);
    });
    
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, updateActivity);
      });
    };
  }, [showTimeout]);

  // Set up session monitoring
  useEffect(() => {
    if (!session) return;
    
    // Check for inactivity periodically
    const newActivityTimer = setInterval(() => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivity;
      
      // If user has been inactive for longer than warning threshold
      if (timeSinceLastActivity >= SESSION_TIMEOUT_WARNING) {
        // Show the timeout modal
        setShowTimeout(true);
        startCountdown();
      }
    }, SESSION_ACTIVITY_CHECK);
    
    setActivityTimer(newActivityTimer);
    
    return () => {
      if (activityTimer) clearInterval(activityTimer);
      if (timer) clearInterval(timer);
    };
  }, [session, lastActivity]);

  const startCountdown = () => {
    setCountdown(5 * 60); // Reset to 5 minutes
    
    if (timer) clearInterval(timer);
    
    const newTimer = setInterval(() => {
      setCountdown(prevCount => {
        if (prevCount <= 1) {
          clearInterval(newTimer);
          handleEndSession();
          return 0;
        }
        return prevCount - 1;
      });
    }, 1000);
    
    setTimer(newTimer);
  };

  const handleKeepSession = async () => {
    await refreshSession();
    setShowTimeout(false);
    if (timer) clearInterval(timer);
  };

  const handleEndSession = async () => {
    await signOut();
  };

  if (!showTimeout) return null;

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  return (
    <Dialog open={showTimeout} onOpenChange={setShowTimeout}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Session Timeout Warning</DialogTitle>
        </DialogHeader>
        <div className="p-4 text-center">
          <p className="mb-4">
            Your session will expire in {minutes}:{seconds.toString().padStart(2, '0')} due to inactivity.
          </p>
          <p>Would you like to continue your session?</p>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="outline" onClick={handleEndSession}>
            End Session
          </Button>
          <Button onClick={handleKeepSession}>
            Continue Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 