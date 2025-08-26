import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, X, SlidersHorizontal, MapPin, Clock, DollarSign } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { debounce } from "@/utils/performance";

interface SearchFilters {
  query: string;
  category: string;
  priceRange: [number, number];
  location: string;
  sortBy: 'newest' | 'oldest' | 'price_high' | 'price_low' | 'deadline';
  status: string[];
  skills: string[];
}

interface AdvancedSearchProps {
  onSearch: (filters: SearchFilters) => void;
  categories: string[];
  initialFilters?: Partial<SearchFilters>;
}

const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  category: 'all',
  priceRange: [0, 10000],
  location: '',
  sortBy: 'newest',
  status: ['active'],
  skills: []
};

const POPULAR_SKILLS = [
  'JavaScript', 'Python', 'React', 'Node.js', 'TypeScript',
  'Design', 'Writing', 'Marketing', 'Photography', 'Video Editing'
];

export function AdvancedSearch({ onSearch, categories, initialFilters }: AdvancedSearchProps) {
  const [filters, setFilters] = useState<SearchFilters>({
    ...DEFAULT_FILTERS,
    ...initialFilters
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [quickFilters, setQuickFilters] = useState<string[]>([]);

  // Debounced search to avoid excessive API calls
  const debouncedSearch = debounce((searchFilters: SearchFilters) => {
    onSearch(searchFilters);
  }, 300);

  useEffect(() => {
    debouncedSearch(filters);
  }, [filters]);

  const updateFilter = <K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const toggleSkill = (skill: string) => {
    const newSkills = filters.skills.includes(skill)
      ? filters.skills.filter(s => s !== skill)
      : [...filters.skills, skill];
    updateFilter('skills', newSkills);
  };

  const addQuickFilter = (filter: string) => {
    if (!quickFilters.includes(filter)) {
      setQuickFilters(prev => [...prev, filter]);
    }
  };

  const removeQuickFilter = (filter: string) => {
    setQuickFilters(prev => prev.filter(f => f !== filter));
  };

  const clearAllFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setQuickFilters([]);
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.query) count++;
    if (filters.category !== 'all') count++;
    if (filters.location) count++;
    if (filters.skills.length > 0) count++;
    if (filters.priceRange[0] > 0 || filters.priceRange[1] < 10000) count++;
    if (filters.status.length !== 1 || !filters.status.includes('active')) count++;
    return count;
  };

  return (
    <div className="space-y-4">
      {/* Main Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Search bounties, skills, or keywords..."
          value={filters.query}
          onChange={(e) => updateFilter('query', e.target.value)}
          className="pl-10 pr-12"
          data-testid="search-input"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
          data-testid="toggle-advanced-search"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </Button>
      </div>

      {/* Quick Filters */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={filters.category === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => updateFilter('category', 'all')}
          data-testid="quick-filter-all"
        >
          All
        </Button>
        {categories.slice(0, 4).map((category) => (
          <Button
            key={category}
            variant={filters.category === category ? 'default' : 'outline'}
            size="sm"
            onClick={() => updateFilter('category', category)}
            data-testid={`quick-filter-${category.toLowerCase()}`}
          >
            {category}
          </Button>
        ))}
        
        {quickFilters.map((filter) => (
          <Badge
            key={filter}
            variant="secondary"
            className="cursor-pointer hover:bg-destructive/20"
            onClick={() => removeQuickFilter(filter)}
          >
            {filter}
            <X className="w-3 h-3 ml-1" />
          </Badge>
        ))}
        
        {getActiveFilterCount() > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearAllFilters}
            className="text-destructive border-destructive"
            data-testid="clear-filters"
          >
            Clear ({getActiveFilterCount()})
          </Button>
        )}
      </div>

      {/* Advanced Filters */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            data-testid="advanced-filters"
          >
            <Card className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Price Range */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Price Range
                  </label>
                  <div className="px-3">
                    <Slider
                      value={filters.priceRange}
                      onValueChange={(value) => updateFilter('priceRange', value as [number, number])}
                      max={10000}
                      min={0}
                      step={50}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>${filters.priceRange[0]}</span>
                      <span>${filters.priceRange[1]}</span>
                    </div>
                  </div>
                </div>

                {/* Location */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Location
                  </label>
                  <Input
                    placeholder="Remote, City, Country..."
                    value={filters.location}
                    onChange={(e) => updateFilter('location', e.target.value)}
                  />
                </div>

                {/* Sort By */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Sort By
                  </label>
                  <Select value={filters.sortBy} onValueChange={(value: any) => updateFilter('sortBy', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest First</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                      <SelectItem value="price_high">Highest Price</SelectItem>
                      <SelectItem value="price_low">Lowest Price</SelectItem>
                      <SelectItem value="deadline">Deadline Soon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Skills Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Required Skills</label>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_SKILLS.map((skill) => (
                    <Badge
                      key={skill}
                      variant={filters.skills.includes(skill) ? 'default' : 'outline'}
                      className="cursor-pointer hover:bg-primary/80"
                      onClick={() => toggleSkill(skill)}
                      data-testid={`skill-filter-${skill.toLowerCase().replace(/\./g, '')}`}
                    >
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Status Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <div className="flex flex-wrap gap-4">
                  {['active', 'completed', 'in_progress'].map((status) => (
                    <div key={status} className="flex items-center space-x-2">
                      <Checkbox
                        id={status}
                        checked={filters.status.includes(status)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            updateFilter('status', [...filters.status, status]);
                          } else {
                            updateFilter('status', filters.status.filter(s => s !== status));
                          }
                        }}
                      />
                      <label htmlFor={status} className="text-sm capitalize cursor-pointer">
                        {status.replace('_', ' ')}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}