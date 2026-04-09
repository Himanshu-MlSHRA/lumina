
import React from 'react';

export const COMMUNITIES = [
  { id: 'progress', name: 'Daily Progress', icon: <i className="fas fa-chart-line"></i>, color: 'bg-blue-100 text-blue-600' },
  { id: 'creative', name: 'Art Therapy', icon: <i className="fas fa-palette"></i>, color: 'bg-purple-100 text-purple-600' },
  { id: 'movement', name: 'Morning Walks', icon: <i className="fas fa-walking"></i>, color: 'bg-green-100 text-green-600' },
  { id: 'zen', name: 'Zen Moments', icon: <i className="fas fa-leaf"></i>, color: 'bg-teal-100 text-teal-600' },
];

export const MOOD_LEVELS = [
  { score: 1, label: 'Very Low', icon: '😫' },
  { score: 3, label: 'Struggling', icon: '😔' },
  { score: 5, label: 'Okay', icon: '😐' },
  { score: 7, label: 'Good', icon: '😊' },
  { score: 9, label: 'Radiant', icon: '✨' },
];
