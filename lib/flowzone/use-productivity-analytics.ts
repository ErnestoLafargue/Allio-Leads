"use client";

import { useState, useEffect, useCallback } from 'react';

export interface TaskAnalytics {
  taskId: string;
  title: string;
  estimatedTime: number; // minutes
  actualTime: number; // minutes  
  completedAt: Date;
  onTime: boolean;
  accuracyPercentage: number;
}

export interface ProductivityMetrics {
  period: 'day' | 'week' | 'month';
  onTimeRate: number; // %
  timeAccuracy: number; // %
  productivityScore: number; // %
  tasksCompleted: number;
  averageTaskTime: number;
  totalEstimatedTime: number;
  totalActualTime: number;
}

const STORAGE_KEY = 'zoneflow-task-analytics';

export const useProductivityAnalytics = () => {
  const [analytics, setAnalytics] = useState<TaskAnalytics[]>([]);

  // Load analytics from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Convert date strings back to Date objects
        const analyticsWithDates = parsed.map((item: any) => ({
          ...item,
          completedAt: new Date(item.completedAt)
        }));
        setAnalytics(analyticsWithDates);
      } catch (error) {
        console.error('Failed to parse analytics data:', error);
      }
    }
  }, []);

  // Save analytics to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(analytics));
  }, [analytics]);

  const addTaskCompletion = useCallback((
    taskId: string,
    title: string,
    estimatedTime: number,
    actualTime: number
  ) => {
    const accuracyPercentage = estimatedTime > 0 
      ? 100 - Math.abs((actualTime - estimatedTime) / estimatedTime * 100)
      : 100;
    
    const onTime = actualTime <= estimatedTime * 1.1; // 10% buffer for "on time"
    
    const newAnalytic: TaskAnalytics = {
      taskId,
      title,
      estimatedTime,
      actualTime,
      completedAt: new Date(),
      onTime,
      accuracyPercentage: Math.max(0, accuracyPercentage)
    };

    setAnalytics(prev => [...prev, newAnalytic]);
  }, []);

  const getMetricsForPeriod = useCallback((period: 'day' | 'week' | 'month', date?: Date): ProductivityMetrics => {
    const targetDate = date || new Date();
    const startDate = new Date(targetDate);
    
    switch (period) {
      case 'day':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        const dayOfWeek = startDate.getDay();
        startDate.setDate(startDate.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        break;
    }

    const endDate = new Date(startDate);
    switch (period) {
      case 'day':
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
        endDate.setDate(endDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'month':
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0); // Last day of month
        endDate.setHours(23, 59, 59, 999);
        break;
    }

    const periodAnalytics = analytics.filter(
      item => item.completedAt >= startDate && item.completedAt <= endDate
    );

    if (periodAnalytics.length === 0) {
      return {
        period,
        onTimeRate: 0,
        timeAccuracy: 0,
        productivityScore: 0,
        tasksCompleted: 0,
        averageTaskTime: 0,
        totalEstimatedTime: 0,
        totalActualTime: 0
      };
    }

    const onTimeCount = periodAnalytics.filter(item => item.onTime).length;
    const onTimeRate = (onTimeCount / periodAnalytics.length) * 100;
    
    const avgAccuracy = periodAnalytics.reduce((sum, item) => sum + item.accuracyPercentage, 0) / periodAnalytics.length;
    
    const totalEstimatedTime = periodAnalytics.reduce((sum, item) => sum + item.estimatedTime, 0);
    const totalActualTime = periodAnalytics.reduce((sum, item) => sum + item.actualTime, 0);
    const averageTaskTime = totalActualTime / periodAnalytics.length;
    
    // Productivity score: weighted average of on-time rate (60%) and accuracy (40%)
    const productivityScore = (onTimeRate * 0.6) + (avgAccuracy * 0.4);

    return {
      period,
      onTimeRate: Math.round(onTimeRate),
      timeAccuracy: Math.round(avgAccuracy),
      productivityScore: Math.round(productivityScore),
      tasksCompleted: periodAnalytics.length,
      averageTaskTime: Math.round(averageTaskTime),
      totalEstimatedTime,
      totalActualTime
    };
  }, [analytics]);

  const getTrendComparison = useCallback((period: 'day' | 'week' | 'month') => {
    const current = getMetricsForPeriod(period);
    
    const previousDate = new Date();
    switch (period) {
      case 'day':
        previousDate.setDate(previousDate.getDate() - 1);
        break;
      case 'week':
        previousDate.setDate(previousDate.getDate() - 7);
        break;
      case 'month':
        previousDate.setMonth(previousDate.getMonth() - 1);
        break;
    }
    
    const previous = getMetricsForPeriod(period, previousDate);
    
    return {
      current,
      previous,
      trends: {
        onTimeRate: current.onTimeRate - previous.onTimeRate,
        timeAccuracy: current.timeAccuracy - previous.timeAccuracy,
        productivityScore: current.productivityScore - previous.productivityScore,
        tasksCompleted: current.tasksCompleted - previous.tasksCompleted
      }
    };
  }, [getMetricsForPeriod]);

  return {
    analytics,
    addTaskCompletion,
    getMetricsForPeriod,
    getTrendComparison
  };
};