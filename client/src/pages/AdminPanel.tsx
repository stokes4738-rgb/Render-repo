import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, AlertTriangle, Ban, Eye, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuthJWT";

interface BannedIP {
  ip: string;
  reason: string;
  timestamp: string;
  userId?: string;
  permanent: boolean;
}

interface SuspiciousIP {
  ip: string;
  data: {
    attempts: number;
    lastAttempt: string;
    reason: string;
  };
}

interface SecurityData {
  bannedIPs: string[];
  suspiciousIPs: SuspiciousIP[];
  timestamp: string;
}

export default function AdminPanel() {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: securityData, isLoading, error, refetch } = useQuery<SecurityData>({
    queryKey: ['/api/admin/banned-ips', refreshKey],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/banned-ips');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    refetch();
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Access denied. Admin privileges required.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Panel</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Security monitoring and user management</p>
        </div>
        <Button onClick={handleRefresh} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Banned IPs</p>
                <p className="text-2xl font-bold text-red-600">
                  {securityData?.bannedIPs?.length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Suspicious IPs</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {securityData?.suspiciousIPs?.length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Last Updated</p>
                <p className="text-sm font-medium">
                  {securityData?.timestamp 
                    ? new Date(securityData.timestamp).toLocaleTimeString()
                    : 'Loading...'
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="banned" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="banned" className="gap-2">
            <Ban className="h-4 w-4" />
            Banned IPs
          </TabsTrigger>
          <TabsTrigger value="suspicious" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Suspicious Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="banned">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-red-500" />
                Permanently Banned IP Addresses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">Loading security data...</p>
                </div>
              ) : error ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Failed to load security data. You may not have admin privileges.
                  </AlertDescription>
                </Alert>
              ) : !securityData?.bannedIPs?.length ? (
                <div className="text-center py-8">
                  <Shield className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">No banned IPs currently</p>
                  <p className="text-sm text-gray-500 mt-1">The platform is clean!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {securityData.bannedIPs.map((ip, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                      <div className="flex items-center gap-3">
                        <Badge variant="destructive">BANNED</Badge>
                        <span className="font-mono text-sm">{ip}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Permanent Ban</span>
                        <Eye className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suspicious">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Suspicious IP Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!securityData?.suspiciousIPs?.length ? (
                <div className="text-center py-8">
                  <Shield className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">No suspicious activity detected</p>
                  <p className="text-sm text-gray-500 mt-1">All systems normal</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {securityData.suspiciousIPs.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                          WATCHING
                        </Badge>
                        <span className="font-mono text-sm">{item.ip}</span>
                        <span className="text-xs text-gray-500">
                          {item.data.attempts} incident{item.data.attempts > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {item.data.reason}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(item.data.lastAttempt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          <strong>Safety Notice:</strong> This panel shows real-time security monitoring. 
          Banned IPs are permanently blocked from accessing the platform. Suspicious IPs are 
          monitored and automatically banned after multiple incidents.
        </AlertDescription>
      </Alert>
    </div>
  );
}