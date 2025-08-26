import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { User, Star, Trophy, Clock, Edit2, Save, X, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { navigateToLogin } from "@/lib/navigation";

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    handle: user?.handle || "",
    bio: user?.bio || "",
    skills: user?.skills || "",
    experience: user?.experience || "",
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PATCH", "/api/user/profile", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Profile updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setIsEditing(false);
    },
    onError: (error: any) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          navigateToLogin();
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(formData);
  };

  const handleCancel = () => {
    setFormData({
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      handle: user?.handle || "",
      bio: user?.bio || "",
      skills: user?.skills || "",
      experience: user?.experience || "",
    });
    setIsEditing(false);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const getInitials = () => {
    if (formData.firstName && formData.lastName) {
      return `${formData.firstName[0]}${formData.lastName[0]}`.toUpperCase();
    }
    if (formData.handle) {
      return formData.handle[0].toUpperCase();
    }
    return user?.email?.[0]?.toUpperCase() || "U";
  };

  const getDisplayName = () => {
    if (formData.firstName && formData.lastName) {
      return `${formData.firstName} ${formData.lastName}`;
    }
    return formData.handle || user?.email || "Unknown User";
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Profile</h1>
        {!isEditing ? (
          <Button 
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2"
            data-testid="button-edit-profile"
          >
            <Edit2 className="h-4 w-4" />
            Edit Profile
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button 
              onClick={handleCancel}
              variant="outline"
              className="flex items-center gap-2"
              data-testid="button-cancel-edit"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={updateProfileMutation.isPending}
              className="flex items-center gap-2"
              data-testid="button-save-profile"
            >
              <Save className="h-4 w-4" />
              {updateProfileMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </div>

      {/* Profile Header */}
      <Card className="theme-transition">
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            {/* Profile Picture */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-3xl font-bold border-4 border-border">
                {user?.profileImageUrl ? (
                  <img 
                    src={user.profileImageUrl} 
                    alt="Profile" 
                    className="w-full h-full rounded-full object-cover"
                    data-testid="img-profile-photo"
                  />
                ) : (
                  <span data-testid="text-profile-initials">
                    {getInitials()}
                  </span>
                )}
              </div>
              {isEditing && (
                <Button
                  size="sm"
                  className="absolute -bottom-2 -right-2 rounded-full w-8 h-8 p-0"
                  data-testid="button-change-photo"
                  onClick={() => {
                    toast({
                      title: "Coming Soon",
                      description: "Profile photo upload will be available soon!",
                    });
                  }}
                >
                  <Camera className="h-3 w-3" />
                </Button>
              )}
            </div>
            
            {/* Profile Info */}
            <div className="flex-1">
              {isEditing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="firstName" className="text-sm">First Name</Label>
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => handleInputChange("firstName", e.target.value)}
                        placeholder="Enter first name"
                        data-testid="input-first-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName" className="text-sm">Last Name</Label>
                      <Input
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) => handleInputChange("lastName", e.target.value)}
                        placeholder="Enter last name"
                        data-testid="input-last-name"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="handle" className="text-sm">Username/Handle</Label>
                    <Input
                      id="handle"
                      value={formData.handle}
                      onChange={(e) => handleInputChange("handle", e.target.value)}
                      placeholder="@username"
                      data-testid="input-handle"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-bold mb-2" data-testid="text-display-name">
                    {getDisplayName()}
                  </h2>
                  <p className="text-muted-foreground mb-1" data-testid="text-email">
                    {user.email}
                  </p>
                  <p className="text-muted-foreground mb-3" data-testid="text-handle">
                    {formData.handle || "@user"}
                  </p>
                </>
              )}
              
              {/* User Stats */}
              <div className="flex items-center gap-4 mt-3">
                {user.username === 'Dallas1221' && (
                  <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white flex items-center gap-1 animate-pulse">
                    👑 CREATOR
                  </Badge>
                )}
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Trophy className="h-3 w-3" />
                  Level {user.level || 1}
                  {user.level >= 999 && " 🔥"}
                </Badge>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Star className="h-3 w-3" />
                  {user.rating || "0.0"} ({user.reviewCount || 0} reviews)
                  {parseFloat(user.rating || "0") === 5.0 && " ⭐"}
                </Badge>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Joined {new Date(user.createdAt).toLocaleDateString()}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bio Section */}
      <Card className="theme-transition">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            About Me
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div>
              <Label htmlFor="bio" className="text-sm">Bio</Label>
              <Textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => handleInputChange("bio", e.target.value)}
                placeholder="Tell us about yourself..."
                rows={4}
                className="mt-1"
                data-testid="textarea-bio"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Share your background, interests, and what makes you unique
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground" data-testid="text-bio">
              {formData.bio || "No bio added yet. Click Edit Profile to add one!"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Skills & Experience */}
      <Card className="theme-transition">
        <CardHeader>
          <CardTitle>Skills & Experience</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <>
              <div>
                <Label htmlFor="skills" className="text-sm">Skills</Label>
                <Textarea
                  id="skills"
                  value={formData.skills}
                  onChange={(e) => handleInputChange("skills", e.target.value)}
                  placeholder="e.g., JavaScript, Design, Writing, Marketing, Photography"
                  rows={3}
                  className="mt-1"
                  data-testid="textarea-skills"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  List your skills separated by commas
                </p>
              </div>
              <div>
                <Label htmlFor="experience" className="text-sm">Experience Level</Label>
                <Input
                  id="experience"
                  value={formData.experience}
                  onChange={(e) => handleInputChange("experience", e.target.value)}
                  placeholder="e.g., Beginner, Intermediate, Expert, 5+ years"
                  className="mt-1"
                  data-testid="input-experience"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <h4 className="font-semibold mb-2">Skills</h4>
                {formData.skills ? (
                  <div className="flex flex-wrap gap-2">
                    {formData.skills.split(",").map((skill: string, index: number) => (
                      <Badge key={index} variant="secondary" className="bg-blue-900/30 border-blue-600/50 text-blue-300">
                        {skill.trim()}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No skills added yet</p>
                )}
              </div>
              <div>
                <h4 className="font-semibold mb-2">Experience Level</h4>
                <p className="text-muted-foreground" data-testid="text-experience">
                  {formData.experience || "Not specified"}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="theme-transition">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-pocket-gold">
              ${parseFloat(user.balance || "0").toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">Current Balance</div>
          </CardContent>
        </Card>
        
        <Card className="theme-transition">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              ${parseFloat(user.lifetimeEarned || "0").toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">Lifetime Earned</div>
          </CardContent>
        </Card>
        
        <Card className="theme-transition">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {user.points || 0}
            </div>
            <div className="text-xs text-muted-foreground">Points</div>
          </CardContent>
        </Card>
        
        <Card className="theme-transition">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {user.reviewCount || 0}
            </div>
            <div className="text-xs text-muted-foreground">Reviews</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}