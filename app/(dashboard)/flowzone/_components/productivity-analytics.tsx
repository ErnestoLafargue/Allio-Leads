"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui';
import { Badge } from './ui';
import { Progress } from './ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui';
import { TrendingUp, TrendingDown, Target, Clock, CheckCircle } from 'lucide-react';
import { useProductivityAnalytics } from '@/lib/flowzone/use-productivity-analytics';

interface ProductivityAnalyticsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProductivityAnalytics: React.FC<ProductivityAnalyticsProps> = ({ isOpen, onClose }) => {
  const [selectedPeriod, setSelectedPeriod] = useState<'day' | 'week' | 'month'>('day');
  const { getMetricsForPeriod, getTrendComparison } = useProductivityAnalytics();

  if (!isOpen) return null;

  const metrics = getMetricsForPeriod(selectedPeriod);
  const trends = getTrendComparison(selectedPeriod);

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours} t ${mins} min`;
    }
    return `${mins} min`;
  };

  const comparisonLabel = {
    day: 'vs. i går',
    week: 'vs. sidste uge',
    month: 'vs. sidste måned',
  }[selectedPeriod];

  const getTrendIcon = (value: number) => {
    if (value > 0) return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (value < 0) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return null;
  };

  const getTrendColor = (value: number) => {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-stone-500';
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold">Produktivitetsstatistik</h2>
            <p className="text-stone-500">Følg hvor effektivt du fuldfører dine opgaver</p>
          </div>
          <button
            onClick={onClose}
            className="text-stone-500 hover:text-stone-900"
            aria-label="Luk"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          <Tabs value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="day">I dag</TabsTrigger>
              <TabsTrigger value="week">Denne uge</TabsTrigger>
              <TabsTrigger value="month">Denne måned</TabsTrigger>
            </TabsList>

            <TabsContent value={selectedPeriod} className="space-y-6 mt-6">
              {/* Key Metrics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Til tiden-rate</CardTitle>
                    <Target className="h-4 w-4 text-stone-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metrics.onTimeRate}%</div>
                    <div className="flex items-center text-xs text-stone-500">
                      {getTrendIcon(trends.trends.onTimeRate)}
                      <span className={getTrendColor(trends.trends.onTimeRate)}>
                        {trends.trends.onTimeRate > 0 ? '+' : ''}{trends.trends.onTimeRate}%
                      </span>
                      <span className="ml-1">{comparisonLabel}</span>
                    </div>
                    <Progress value={metrics.onTimeRate} className="mt-2" />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Tidspræcision</CardTitle>
                    <Clock className="h-4 w-4 text-stone-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metrics.timeAccuracy}%</div>
                    <div className="flex items-center text-xs text-stone-500">
                      {getTrendIcon(trends.trends.timeAccuracy)}
                      <span className={getTrendColor(trends.trends.timeAccuracy)}>
                        {trends.trends.timeAccuracy > 0 ? '+' : ''}{trends.trends.timeAccuracy}%
                      </span>
                      <span className="ml-1">{comparisonLabel}</span>
                    </div>
                    <Progress value={metrics.timeAccuracy} className="mt-2" />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Produktivitetsscore</CardTitle>
                    <CheckCircle className="h-4 w-4 text-stone-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metrics.productivityScore}%</div>
                    <div className="flex items-center text-xs text-stone-500">
                      {getTrendIcon(trends.trends.productivityScore)}
                      <span className={getTrendColor(trends.trends.productivityScore)}>
                        {trends.trends.productivityScore > 0 ? '+' : ''}{trends.trends.productivityScore}%
                      </span>
                      <span className="ml-1">{comparisonLabel}</span>
                    </div>
                    <Progress value={metrics.productivityScore} className="mt-2" />
                  </CardContent>
                </Card>
              </div>

              {/* Detailed Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Opgavestatistik</CardTitle>
                    <CardDescription>Fuldførelse og tidsanalyse</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Fuldførte opgaver</span>
                      <Badge variant="secondary">{metrics.tasksCompleted}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Gennemsnitlig opgavetid</span>
                      <span className="text-sm text-stone-500">
                        {formatTime(metrics.averageTaskTime)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Estimeret i alt</span>
                      <span className="text-sm text-stone-500">
                        {formatTime(metrics.totalEstimatedTime)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Faktisk i alt</span>
                      <span className="text-sm text-stone-500">
                        {formatTime(metrics.totalActualTime)}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Indsigt i præstation</CardTitle>
                    <CardDescription>Sådan forbedrer du din produktivitet</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {metrics.onTimeRate >= 80 ? (
                      <div className="flex items-start space-x-2">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-green-700">Fremragende tidsstyring!</p>
                          <p className="text-xs text-stone-500">Du fuldfører de fleste opgaver til tiden.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start space-x-2">
                        <Target className="w-4 h-4 text-orange-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-orange-700">Plads til forbedring</p>
                          <p className="text-xs text-stone-500">Overvej at lægge buffertid ind i dine estimater.</p>
                        </div>
                      </div>
                    )}

                    {metrics.timeAccuracy >= 75 ? (
                      <div className="flex items-start space-x-2">
                        <Clock className="w-4 h-4 text-green-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-green-700">Flotte estimater!</p>
                          <p className="text-xs text-stone-500">Dine tidsestimater er ret præcise.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start space-x-2">
                        <Clock className="w-4 h-4 text-orange-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-orange-700">Øv dig i at estimere</p>
                          <p className="text-xs text-stone-500">Følg dine mønstre for at forbedre dine tidsestimater.</p>
                        </div>
                      </div>
                    )}

                    {trends.trends.productivityScore > 0 && (
                      <div className="flex items-start space-x-2">
                        <TrendingUp className="w-4 h-4 text-green-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-green-700">Stigende tendens!</p>
                          <p className="text-xs text-stone-500">Bliv ved med det gode arbejde.</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {metrics.tasksCompleted === 0 && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-8">
                    <Target className="w-12 h-12 text-stone-500 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Ingen fuldførte opgaver endnu</h3>
                    <p className="text-stone-500 text-center max-w-md">
                      Fuldfør nogle opgaver med timeren for at se din produktivitetsstatistik her.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};