import React, { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { UserCheck, Clock, Eye, Info, X, CheckCircle2 } from 'lucide-react';

interface RecognizedFaceAlertProps {
  employee: {
    name: string;
    employee_id?: string;
    department?: string;
    position?: string;
  };
  status: 'present' | 'late';
  timestamp: Date;
  imageUrl?: string;
  onDismiss?: () => void;
  onViewDetails?: () => void;
}

const RecognizedFaceAlert: React.FC<RecognizedFaceAlertProps> = ({
  employee,
  status,
  timestamp,
  imageUrl,
  onDismiss,
  onViewDetails,
}) => {
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const { toast } = useToast();

  const getStatusIcon = () => {
    return status === 'present' ? (
      <CheckCircle2 className="h-5 w-5 text-green-500" />
    ) : (
      <Clock className="h-5 w-5 text-amber-500" />
    );
  };

  const getStatusText = () => {
    return status === 'present' ? 'Present' : 'Late Arrival';
  };

  const getStatusColor = () => {
    return status === 'present' ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800';
  };

  const handleMarkAsPresent = () => {
    toast({
      title: "Status Updated",
      description: `${employee.name} has been marked as present.`,
      variant: "default",
    });
    onDismiss?.();
  };

  return (
    <>
      <Alert className={`${getStatusColor()} relative`}>
        <div className="flex items-start gap-3 pr-8">
          {getStatusIcon()}
          <div className="flex-1 min-w-0">
            <AlertDescription className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="font-semibold text-base">{employee.name}</span>
                <Badge 
                  variant={status === 'present' ? 'default' : 'secondary'}
                  className={status === 'present' 
                    ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-800 dark:text-green-100' 
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-800 dark:text-amber-100'
                  }
                >
                  {getStatusText()}
                </Badge>
              </div>
              
              <p className="text-sm text-muted-foreground">
                Attendance recorded at {timestamp.toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </p>

              <div className="flex flex-wrap gap-2 pt-2">
                {imageUrl && (
                  <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8">
                        <Eye className="h-3 w-3 mr-1" />
                        View Image
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Captured Image - {employee.name}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <img 
                          src={imageUrl} 
                          alt={`Captured image of ${employee.name}`}
                          className="w-full h-auto rounded-lg border"
                        />
                        <div className="text-sm text-muted-foreground">
                          <p><strong>Time:</strong> {timestamp.toLocaleString()}</p>
                          <p><strong>Status:</strong> {getStatusText()}</p>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8">
                      <Info className="h-3 w-3 mr-1" />
                      Details
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Employee Details</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Name:</span>
                          <p>{employee.name}</p>
                        </div>
                        {employee.employee_id && (
                          <div>
                            <span className="font-medium">ID:</span>
                            <p>{employee.employee_id}</p>
                          </div>
                        )}
                        {employee.department && (
                          <div>
                            <span className="font-medium">Department:</span>
                            <p>{employee.department}</p>
                          </div>
                        )}
                        {employee.position && (
                          <div>
                            <span className="font-medium">Position:</span>
                            <p>{employee.position}</p>
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Status:</span>
                          <p>{getStatusText()}</p>
                        </div>
                        <div>
                          <span className="font-medium">Time:</span>
                          <p>{timestamp.toLocaleTimeString()}</p>
                        </div>
                      </div>

                      {status === 'late' && (
                        <div className="space-y-2">
                          <h4 className="font-medium">Actions:</h4>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={handleMarkAsPresent}
                              className="flex-1"
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Mark as Present
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={onDismiss}
                  className="h-8 ml-auto"
                >
                  Dismiss
                </Button>
              </div>
            </AlertDescription>
          </div>
        </div>
        
        {/* Close button */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-2 top-2 h-6 w-6 p-0"
          onClick={onDismiss}
        >
          <X className="h-3 w-3" />
        </Button>
      </Alert>
    </>
  );
};

export default RecognizedFaceAlert;